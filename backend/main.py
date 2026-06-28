import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv

# Load local environment variables
load_dotenv()

from parser import parse_document
from vector_store import add_document
from rag_engine import index_kb_if_empty, reindex_kb, extract_structured_metrics, generate_rag_response, generate_rag_stream

# Initialize Gemini Client
api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("WARNING: GEMINI_API_KEY is not set. The application will fail to run Gemini model queries.")
    client = None
else:
    client = genai.Client(api_key=api_key)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Index the medical knowledge base on startup."""
    if client:
        reindex_kb(client)   # Force re-index to pick up newly added KB panels
    else:
        print("Skipping knowledge base indexing due to missing GEMINI_API_KEY.")
    yield

app = FastAPI(title="PathoInsight RAG Backend", lifespan=lifespan)

DOC_ID_PATIENT = "patient_report"

# Enable CORS for frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str

@app.post("/api/upload")
async def upload_report(file: UploadFile = File(...)):
    """
    Receives a pathology report PDF/image.
    Performs OCR/text extraction, indexes chunks in SQLite,
    extracts structured metrics, and returns them as JSON.
    """
    if not client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized. Please verify your GEMINI_API_KEY.")

    try:
        contents = await file.read()
        raw_text = parse_document(contents, file.filename, client)

        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="No readable text could be extracted from the file.")

        add_document(DOC_ID_PATIENT, raw_text, client)
        structured_metrics = extract_structured_metrics(raw_text, client)

        return {
            "success": True,
            "filename": file.filename,
            "data": structured_metrics
        }

    except Exception as e:
        print(f"Error handling report upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_query(request: ChatRequest):
    """Non-streaming chat endpoint (fallback)."""
    if not client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized. Please verify your GEMINI_API_KEY.")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    try:
        answer = generate_rag_response(request.query, DOC_ID_PATIENT, client)
        return {"response": answer}
    except Exception as e:
        print(f"Error handling chat query: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint using Server-Sent Events (SSE).
    Streams token-by-token and sends citations as a final event.
    """
    if not client:
        raise HTTPException(status_code=500, detail="Gemini client not initialized. Please verify your GEMINI_API_KEY.")

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    return StreamingResponse(
        generate_rag_stream(request.query, DOC_ID_PATIENT, client),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@app.get("/api/health")
def health_check():
    return {"status": "ok", "api_key_configured": api_key is not None}
