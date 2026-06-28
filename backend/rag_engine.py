import json
import sqlite3
from google.genai import types
from google.genai.types import Tool, GoogleSearch
from vector_store import add_document, search_similarity, DB_PATH

def index_kb_if_empty(client):
    """
    Checks if the medical knowledge base has been indexed in SQLite.
    If not, reads medical_kb.json, converts it to readable chunks, and inserts them.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) FROM document_chunks WHERE doc_id = 'medical_kb'")
        count = cursor.fetchone()[0]
    except sqlite3.OperationalError:
        count = 0
    finally:
        conn.close()

    if count > 0:
        print("Medical knowledge base is already indexed in vector database.")
        return

    print("Indexing medical knowledge base from medical_kb.json...")
    try:
        with open("medical_kb.json", "r") as f:
            kb_data = json.load(f)

        kb_text_chunks = []
        for cat in kb_data["categories"]:
            cat_name = cat["name"]
            for marker_name, info in cat["markers"].items():
                chunk_str = (
                    f"Test Category: {cat_name}. \n"
                    f"Test Name: {marker_name}. \n"
                    f"Reference Range: {info['min']} - {info['max']} {info['unit']}. \n"
                    f"Description: {info['description']} \n"
                    f"Low Level Explanation: {info['low_explanation']} \n"
                    f"High Level Explanation: {info['high_explanation']}"
                )
                kb_text_chunks.append(chunk_str)

        kb_text = "\n\n---\n\n".join(kb_text_chunks)
        add_document("medical_kb", kb_text, client)
        print("Medical knowledge base successfully indexed.")
    except Exception as e:
        print(f"Error indexing medical knowledge base: {e}")

def reindex_kb(client):
    """Force re-indexes the medical KB (call when medical_kb.json is updated)."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM document_chunks WHERE doc_id = 'medical_kb'")
        conn.commit()
    except Exception:
        pass
    finally:
        conn.close()
    index_kb_if_empty(client)

def extract_structured_metrics(raw_text: str, client) -> dict:
    """
    Uses Gemini's structured output mode to parse unstructured report text
    into a structured JSON payload conforming to the dashboard requirements.
    """
    print("Extracting structured metrics from report text...")
    prompt = (
        "You are an expert clinical report parser. Read the following pathology lab report "
        "and extract the patient demographics and ALL test results found. "
        "Format them strictly to match the JSON schema below.\n\n"
        "Required Schema:\n"
        "{\n"
        "  \"patient\": {\n"
        "    \"name\": \"Name or 'Unknown'\",\n"
        "    \"age\": 42,\n"
        "    \"gender\": \"Male/Female or 'Unknown'\",\n"
        "    \"date\": \"Report date or 'Unknown'\",\n"
        "    \"id\": \"Patient/Accession ID or 'Unknown'\"\n"
        "  },\n"
        "  \"categories\": [\n"
        "    {\n"
        "      \"id\": \"cbc\",\n"
        "      \"name\": \"Complete Blood Count (CBC)\",\n"
        "      \"description\": \"Brief summary of what this test category checks\",\n"
        "      \"metrics\": [\n"
        "        {\n"
        "          \"name\": \"Hemoglobin\",\n"
        "          \"value\": 12.5,\n"
        "          \"unit\": \"g/dL\",\n"
        "          \"minRef\": 13.8,\n"
        "          \"maxRef\": 17.2,\n"
        "          \"status\": \"low\",\n"
        "          \"explanation\": \"Brief 1-2 sentence clinical explanation of what this level means\"\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Use these category IDs: cbc, lft, kft, thyroid, lipid, other.\n"
        "Set status to 'low', 'normal', or 'high' based on the reference range from the report.\n\n"
        f"Lab Report Raw Text:\n{raw_text}"
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Error during structured metrics extraction: {e}")
        return {
            "patient": {"name": "Unknown", "age": None, "gender": "Unknown", "date": "Unknown", "id": "Unknown"},
            "categories": []
        }

def _build_rag_prompt(query: str, patient_doc_id: str, client):
    """Retrieves context and builds the prompt + system instruction for RAG."""
    patient_chunks = search_similarity(query, client, doc_ids=[patient_doc_id], top_k=3)
    patient_context = "\n---\n".join([c["text"] for c in patient_chunks]) if patient_chunks else "No patient report data available."

    kb_chunks = search_similarity(query, client, doc_ids=["medical_kb"], top_k=3)
    kb_context = "\n---\n".join([c["text"] for c in kb_chunks]) if kb_chunks else "No knowledge base data available."

    system_instruction = (
        "You are an empathetic, clinical AI medical communicator helping a patient understand their lab test report. "
        "Explain medical terms simply, without excessive clinical jargon. Be reassuring but accurate. "
        "Use the provided patient report details and reference ranges to answer the patient's questions.\n\n"
        "CRITICAL RULES:\n"
        "1. Never give definitive diagnoses. Use phrases like 'could suggest', 'points towards', or 'is associated with'.\n"
        "2. If you notice out-of-range results, explain what they mean but always direct the patient to talk to their doctor.\n"
        "3. End every response with a brief disclaimer: '⚕️ *This is for educational purposes only. Always consult your physician for clinical advice.*'\n"
        "4. When discussing medications, symptoms, or topics beyond standard ranges, use Google Search grounding to provide current, accurate information.\n"
        "5. When you cite sources from web search, briefly mention the source name (e.g., 'According to Mayo Clinic...')."
    )

    prompt = (
        f"Context from Patient's Report:\n{patient_context}\n\n"
        f"Context from Clinical Guidelines & Reference Ranges:\n{kb_context}\n\n"
        f"Patient Question: {query}"
    )

    return prompt, system_instruction

def generate_rag_response(query: str, patient_doc_id: str, client) -> str:
    """Non-streaming RAG response (kept for compatibility)."""
    print(f"Generating RAG response for query: {query}...")
    prompt, system_instruction = _build_rag_prompt(query, patient_doc_id, client)

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[Tool(google_search=GoogleSearch())]
            )
        )
        return response.text
    except Exception as e:
        print(f"Error during RAG generation: {e}")
        return "I apologize, but I encountered an error. Please consult your physician for clinical queries."

async def generate_rag_stream(query: str, patient_doc_id: str, client):
    """
    Async generator that streams Gemini response tokens via Server-Sent Events.
    Yields SSE-formatted strings: text chunks, then a final citations event.
    """
    print(f"Streaming RAG response for: {query}...")
    prompt, system_instruction = _build_rag_prompt(query, patient_doc_id, client)

    try:
        full_response = None
        async for chunk in await client.aio.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                tools=[Tool(google_search=GoogleSearch())]
            )
        ):
            # Stream text chunks
            if chunk.text:
                data = json.dumps({"type": "text", "content": chunk.text})
                yield f"data: {data}\n\n"
            # Capture last chunk for metadata
            full_response = chunk

        # Extract citations from grounding metadata
        citations = []
        try:
            if (full_response and
                full_response.candidates and
                full_response.candidates[0].grounding_metadata):
                metadata = full_response.candidates[0].grounding_metadata
                seen_urls = set()
                if hasattr(metadata, 'grounding_chunks') and metadata.grounding_chunks:
                    for gc in metadata.grounding_chunks:
                        if hasattr(gc, 'web') and gc.web:
                            url = getattr(gc.web, 'uri', None) or getattr(gc.web, 'url', None)
                            title = getattr(gc.web, 'title', url)
                            if url and url not in seen_urls:
                                seen_urls.add(url)
                                citations.append({"title": title, "url": url})
        except Exception as ce:
            print(f"Citation extraction error (non-fatal): {ce}")

        # Send citations as final SSE event
        yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        print(f"Error during RAG streaming: {e}")
        err = json.dumps({"type": "error", "content": "I encountered an error generating a response. Please try again."})
        yield f"data: {err}\n\n"
