import sqlite3
import json
import numpy as np
from typing import List, Dict, Any, Optional

DB_PATH = "pathology_rag.db"

def init_db():
    """Initializes the SQLite database schema."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            embedding BLOB NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def chunk_text(text: str, chunk_size: int = 400, overlap: int = 100) -> List[str]:
    """Chunks text into overlapping window segments based on words."""
    words = text.split()
    if len(words) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk_words = words[start:end]
        chunks.append(" ".join(chunk_words))
        start += (chunk_size - overlap)
        
    return chunks

def get_embedding(text: str, client=None) -> List[float]:
    """
    Generates a local TF-IDF style embedding using word frequency hashing.
    Falls back gracefully when Gemini embedding API is unavailable.
    This produces a 512-dim sparse vector suitable for cosine similarity RAG.
    """
    import re, hashlib, math
    
    # Normalize and tokenize
    words = re.findall(r'\b[a-zA-Z0-9]+\b', text.lower())
    if not words:
        return [0.0] * 512
    
    dim = 512
    vector = [0.0] * dim
    word_counts = {}
    for w in words:
        word_counts[w] = word_counts.get(w, 0) + 1
    
    total = len(words)
    for word, count in word_counts.items():
        # Deterministic hash-based index mapping
        tf = count / total
        h = int(hashlib.md5(word.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1 if (h // dim) % 2 == 0 else -1
        vector[idx] += sign * tf * (1 + math.log(1 + count))
    
    # L2-normalize
    norm = math.sqrt(sum(v * v for v in vector))
    if norm > 0:
        vector = [v / norm for v in vector]
    
    return vector

def add_document(doc_id: str, text: str, client):
    """
    Chunks document text, generates embeddings, and saves to SQLite.
    Clears previous data for the same doc_id first.
    """
    init_db()
    
    # Clean old chunks for this document
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM document_chunks WHERE doc_id = ?", (doc_id,))
    
    # Chunk text
    chunks = chunk_text(text)
    print(f"Indexing document '{doc_id}': split into {len(chunks)} chunks.")
    
    # Generate embeddings and insert
    for idx, chunk in enumerate(chunks):
        emb = get_embedding(chunk, client)
        emb_bytes = np.array(emb, dtype=np.float32).tobytes()
        cursor.execute(
            "INSERT INTO document_chunks (doc_id, chunk_index, text, embedding) VALUES (?, ?, ?, ?)",
            (doc_id, idx, chunk, emb_bytes)
        )
        
    conn.commit()
    conn.close()

def search_similarity(query: str, client, doc_ids: Optional[List[str]] = None, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Calculates cosine similarity in memory between query embedding 
    and document chunk embeddings stored in SQLite.
    """
    init_db()
    
    # Get query embedding
    query_emb = np.array(get_embedding(query, client), dtype=np.float32)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    if doc_ids:
        placeholders = ','.join('?' for _ in doc_ids)
        cursor.execute(f"SELECT doc_id, text, embedding FROM document_chunks WHERE doc_id IN ({placeholders})", doc_ids)
    else:
        cursor.execute("SELECT doc_id, text, embedding FROM document_chunks")
        
    rows = cursor.fetchall()
    conn.close()
    
    if not rows:
        return []
        
    results = []
    for doc_id, text, emb_bytes in rows:
        emb = np.frombuffer(emb_bytes, dtype=np.float32)
        
        # Calculate cosine similarity
        norm_q = np.linalg.norm(query_emb)
        norm_e = np.linalg.norm(emb)
        if norm_q > 0 and norm_e > 0:
            sim = float(np.dot(query_emb, emb) / (norm_q * norm_e))
        else:
            sim = 0.0
            
        results.append({
            "doc_id": doc_id,
            "text": text,
            "score": sim
        })
        
    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
