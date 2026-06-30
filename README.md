<h1>
  <img src="icon.png" width="40" height="40" style="vertical-align: middle;">
  PathoInsight
</h1>
<img src="thumbnail.png" style="vertical-align: middle;">

> **An AI-powered Retrieval-Augmented Generation (RAG) assistant for demystifying pathology reports.**

PathoInsight helps patients understand their lab reports (CBC, LFT, KFT, Thyroid, Lipid profiles) by combining local document parsing, vector-based semantic search, and Google Gemini's advanced LLM with live Google Search grounding. It provides an empathetic, knowledgeable medical AI assistant that explains complex medical terminology in plain language.

![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=flat-square&logo=node.js)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)
![React](https://img.shields.io/badge/React-FFFFFF?style=flat-square&logo=react)
![Vite](https://img.shields.io/badge/Vite-FFFFFF?style=flat-square&logo=vite)
![FastAPI](https://img.shields.io/badge/FastAPI-FFFFFF?style=flat-square&logo=fastapi)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite)
![NumPy](https://img.shields.io/badge/NumPy-013243?style=flat-square&logo=numpy)
![Google Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square&logo=google)
![Gemini 2.5 Flash](https://img.shields.io/badge/LLM-Gemini_2.5_Flash-4285F4?style=flat-square)
![text-embedding-004](https://img.shields.io/badge/Embedding-text--embedding--004-34A853?style=flat-square)
![pdfplumber](https://img.shields.io/badge/pdfplumber-PDF_Parser-orange?style=flat-square)
---

## ⚠️ Medical Disclaimer

**PathoInsight is strictly an educational tool and does not provide medical advice, diagnosis, or treatment.** 

The AI-generated insights, summaries, and explanations are for informational purposes only. Do not disregard professional medical advice or delay seeking it because of information provided by this application. 

**Always consult a qualified physician or healthcare provider for clinical decisions regarding your test results.**

---

## 💡 The Concept & Idea

Medical reports are often filled with complex terminology, abbreviations, and numerical values that can be overwhelming. PathoInsight bridges this gap by:

1. **Extracting** structured data from raw pathology reports (PDFs or images).
2. **Contextualizing** the results against a built-in medical knowledge base covering 5 major panels (CBC, LFT, KFT, Thyroid Profile, Lipid Profile).
3. **Explaining** the findings in plain, empathetic language via an interactive chat interface.
4. **Grounding** its answers using live Google Search to ensure responses reflect current medical guidelines and literature.

### Demo Video Link: [LINK](https://youtu.be/Bb2GE9WdUyI?si=hANR-krpAZygaD9M)

**The Goal:** Empower patients to have more informed and meaningful conversations with their doctors.

---

## ✨ Key Features

*   **Hybrid Parsing Engine**: Automatically detects if a PDF has a text layer. Uses fast, free, local parsing (`pdfplumber`) for digital PDFs, and gracefully falls back to multimodal OCR (Gemini Vision) for scanned images or non-searchable PDFs.
*   **Two-Tier RAG Context**: Chat responses are informed simultaneously by the specific patient data (from the uploaded report) and general reference guidelines (from the local KB).
*   **Live Web Grounding**: The LLM isn't limited to training cutoffs. The AI fetches the latest clinical guidelines via Google Search mid-response and provides clickable citations.
*   **Server-Sent Events (SSE) Streaming**: Chat responses stream into the UI token-by-token for a fast, responsive, "typing" experience.
*   **Dynamic UI Suggestions**: Chat suggestion pills are generated at runtime based specifically on the *abnormal* metrics found in the uploaded report.
*   **Compact Table Dashboard**: Clean, scannable layout mimicking real lab reports for easy reading, designed in a custom Light Mode CSS system.

---

## 🏗️ Architecture

PathoInsight is built with a modern, decoupled architecture designed for speed, low overhead, and accurate AI responses.

> **For a deep dive into the data flow and RAG pipeline, read the full [ARCHITECTURE.md](./ARCHITECTURE.md).**

### System Diagram

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

### Component Breakdown

1. **Parser (`parser.py`)**: 
   ```mermaid
   flowchart LR
       INPUT["PDF / Image"] --> CHECK{"Digital Text?"}
       CHECK -->|"Yes"| LOCAL["pdfplumber"]
       CHECK -->|"No"| OCR["Gemini Vision OCR"]
       LOCAL --> OUT["Raw Text"]
       OCR --> OUT
   ```
2. **Vector Store (`vector_store.py`)**: A lightweight SQLite database storing text chunks and their 768-dimensional float embeddings as binary blobs. Searching is done via fast numpy-based cosine similarity.
3. **RAG Engine (`rag_engine.py`)**: The orchestrator. It handles chunking documents, querying the vector store for both patient context and medical context, and constructing the grounded prompt for Gemini.

---

## 🛠️ Technology Stack

| Domain | Technology | Reason |
| :--- | :--- | :--- |
| **Frontend** | React, Vite, Vanilla CSS | Fast HMR, lightweight, responsive UI. |
| **Backend** | Python, FastAPI, Uvicorn | High performance async Python framework. |
| **LLM & Vision** | Google Gemini (`gemini-2.5-flash`) | Fast, supports JSON schema, multimodal OCR, and Grounding tools. |
| **Embeddings** | Google Gemini (`text-embedding-004`) | High quality 768-dimensional semantic embeddings. |
| **Vector DB** | SQLite + NumPy | Zero-dependency, self-contained, no external infrastructure needed. |
| **PDF Extraction**| `pdfplumber` | Best-in-class local text extraction for digital PDFs. |

---

## 🚀 Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   Python (3.10+)
*   A Google Gemini API Key

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Activate virtual environment
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install fastapi uvicorn google-genai pdfplumber numpy

# Set your API Key
# On Windows:
set GEMINI_API_KEY=your_api_key_here
# On Mac/Linux:
export GEMINI_API_KEY=your_api_key_here

# Run the server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
The backend will run at `http://localhost:8000`.

### 2. Frontend Setup

Open a new terminal window:

```bash
cd frontend

# Install dependencies
npm install

# Run the Vite development server
npm run dev
```
The frontend will run at `http://localhost:5173` (or the next available port).

---

## 📖 Usage Guide

1. **Load a Report**: Open the web app. You can either drag-and-drop a PDF/image of a pathology report, or click **"Load 5-Panel Demo"** to see a pre-populated example featuring mock patient data.
2. **Review the Dashboard**: The left panel will populate with extracted metrics organized by categories (e.g., CBC, LFT), highlighting normal vs. abnormal results.
3. **Ask Questions**: Use the chat panel on the right. If the report has abnormal values, dynamic suggestion pills will appear (e.g., *"Why is my ALT high?"*). Click them or type your own question.
4. **Read Citations**: When the bot responds, it may fetch live data from the internet. Click the "Sources" links below the message to read the original medical articles.
