# PathoInsight — System Architecture

This document outlines the technical architecture, data flow, and RAG pipeline for the PathoInsight application.

---

## 1. High-Level System Architecture

The system is decoupled into a frontend React client and a backend FastAPI service. All AI operations (LLM, embeddings, OCR) are offloaded to the Google Gemini API.

```mermaid
graph TB
    subgraph Browser["Browser (localhost:5173)"]
        UI["React Frontend\nApp.jsx"]
    end

    subgraph Backend["FastAPI Backend (localhost:8000)"]
        API["main.py\nAPI Router"]
        PARSER["parser.py\nHybrid OCR Engine"]
        RAG["rag_engine.py\nRAG Pipeline"]
        VS["vector_store.py\nSQLite Vector DB"]
        KB["medical_kb.json\nLocal Knowledge Base"]
    end

    subgraph Gemini["Google Gemini API"]
        EMB["text-embedding-004\nEmbeddings"]
        LLM["gemini-2.5-flash\nLLM + JSON mode"]
        GSEARCH["Google Search\nGrounding Tool"]
    end

    UI -->|"POST /api/upload (PDF/Image)"| API
    UI -->|"POST /api/chat/stream (SSE)"| API
    API --> PARSER
    PARSER -->|"Digital text"| RAG
    PARSER -->|"Scanned image → OCR"| LLM
    RAG --> VS
    RAG --> KB
    VS <-->|"embed + cosine search"| EMB
    RAG -->|"structured JSON"| LLM
    RAG -->|"RAG chat + streaming"| LLM
    LLM <--> GSEARCH
    API -->|"SSE token stream"| UI
```

---

## 2. Hybrid Document Parser (`parser.py`)

To optimize for both speed and cost, the parser dynamically determines how to extract text from user uploads.

```mermaid
flowchart LR
    INPUT["PDF / Image file bytes"]
    CHECK{"Is it a\ndigital PDF?"}
    LOCAL["pdfplumber\nLocal text extract"]
    OCR["Gemini Vision\nMultimodal OCR"]
    OUT["Raw text string"]

    INPUT --> CHECK
    CHECK -->|"Yes — has selectable text"| LOCAL
    CHECK -->|"No — scanned/image"| OCR
    LOCAL --> OUT
    OCR --> OUT
```
*   **Digital PDFs**: Extracted locally. Zero API cost, nearly instant.
*   **Scanned Images/PDFs**: Fallback to Gemini Vision multimodal prompting to read text from pixels.

---

## 3. Vector Database & Storage (`vector_store.py`)

Instead of using a heavy external vector database (like Pinecone or Milvus), PathoInsight uses a lightweight, self-contained SQLite implementation.

```mermaid
flowchart TD
    TEXT["Raw text\n(report or KB)"]
    CHUNK["Split into ~500-char\noverlapping chunks"]
    EMBED["Gemini text-embedding-004\n→ 768-dim float vector"]
    STORE["SQLite table\ndocument_chunks\n(doc_id, text, embedding_blob)"]
    QUERY["Query text"]
    QEMBED["Query embedding"]
    COS["Cosine similarity\nvs all stored vectors"]
    TOPK["Top-K chunks returned"]

    TEXT --> CHUNK --> EMBED --> STORE
    QUERY --> QEMBED --> COS
    STORE --> COS --> TOPK
```
Embeddings are serialized into binary blobs. Similarity search is executed in memory using `numpy` cosine distance calculations, which is highly performant for individual medical records.

---

## 4. The Two-Tier RAG Pipeline (`rag_engine.py`)

When a user asks a question, the system performs a Two-Tier Retrieval Augmented Generation sequence. It fetches context from *both* the patient's specific report and the general medical knowledge base.

```mermaid
sequenceDiagram
    participant FE as Frontend (App.jsx)
    participant API as Backend (FastAPI)
    participant VS as SQLite Vector DB
    participant GEMINI as Gemini LLM

    FE->>API: POST /api/chat/stream {query}
    
    Note over API,VS: Tier 1: Patient Context
    API->>VS: search_similarity(query, "patient_report", top_k=3)
    VS-->>API: Patient report chunks
    
    Note over API,VS: Tier 2: Medical Context
    API->>VS: search_similarity(query, "medical_kb", top_k=3)
    VS-->>API: KB reference range chunks
    
    Note over API,GEMINI: Generation & Grounding
    API->>GEMINI: generate_content_stream(prompt + context + tools=[GoogleSearch])
    
    loop Token streaming via SSE
        GEMINI-->>API: chunk.text
        API-->>FE: data: {"type":"text","content":"..."}
    end
    
    Note over GEMINI,API: Grounding extraction
    GEMINI-->>API: grounding_metadata (citations/URLs)
    API-->>FE: data: {"type":"citations","citations":[...]}
    API-->>FE: data: {"type":"done"}
```

### Prompt Structure
The final prompt sent to the LLM looks like this:
```text
System: You are an empathetic medical AI. Never diagnose. Always disclaim.

Context 1 — Patient's Report:
[top 3 semantically similar chunks from the uploaded report]

Context 2 — Clinical Guidelines:
[top 3 semantically similar chunks from medical_kb.json]

Patient Question:
[user's query]
```

---

## 5. Google Search Grounding

To ensure the AI provides up-to-date information (e.g., the latest clinical guidelines for managing elevated LDL cholesterol), the LLM is initialized with `tools=[Tool(google_search=GoogleSearch())]`. 

If the model detects that the user's query requires external, current knowledge, it autonomously executes a Google Search, ingests the top results into its context window mid-generation, and returns the source URLs in the `grounding_metadata` block. The backend parses this block and streams it to the frontend to render clickable source citations.
