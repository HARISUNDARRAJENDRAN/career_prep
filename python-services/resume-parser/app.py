from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf  # PyMuPDF
from docx import Document
from openai import OpenAI
import os
import json
from dotenv import load_dotenv

# Load environment variables from parent .env file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client (v1.0+ API)
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF with password protection handling"""
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")

        # Check if PDF is encrypted/password-protected
        if doc.is_encrypted:
            doc.close()
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported. Please remove the password and try again."
            )

        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except RuntimeError as e:
        # PyMuPDF raises RuntimeError for corrupted or invalid PDFs
        raise HTTPException(
            status_code=400,
            detail=f"Invalid or corrupted PDF file: {str(e)}"
        )

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX using python-docx"""
    from io import BytesIO
    doc = Document(BytesIO(file_bytes))
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

async def parse_resume_with_ai(resume_text: str) -> dict:
    """Use OpenAI to extract structured data from resume"""
    prompt = f"""Analyze this resume and extract:
1. Technical Skills (programming languages, frameworks, tools)
2. Soft Skills (leadership, communication, teamwork, etc.)
3. Projects (title and brief description)
4. Certifications
5. Spoken languages

Resume:
{resume_text}

Return ONLY valid JSON with these exact keys:
{{
  "technical_skills": ["skill1", "skill2"],
  "soft_skills": ["skill1", "skill2"],
  "projects": [{{"title": "Project Name", "description": "Brief desc"}}],
  "certifications": ["cert1", "cert2"],
  "languages": ["English", "Spanish"]
}}"""

    # Use new OpenAI v1.0+ API
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a resume parsing assistant. Extract structured data from resumes and return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        temperature=0,
    )

    content = response.choices[0].message.content

    # Handle markdown code blocks in response
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]

    return json.loads(content.strip())

@app.post("/parse-resume")
async def parse_resume(file: UploadFile):
    """Parse uploaded resume and return structured data"""
    if not file.filename.endswith(('.pdf', '.docx')):
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported")

    file_bytes = await file.read()

    # Extract text based on file type
    if file.filename.endswith('.pdf'):
        resume_text = extract_text_from_pdf(file_bytes)
    else:
        resume_text = extract_text_from_docx(file_bytes)

    if not resume_text or len(resume_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="Could not extract text from resume")

    # Parse with AI
    try:
        parsed_data = await parse_resume_with_ai(resume_text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response as JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

    # Combine all skills
    all_skills = parsed_data.get('technical_skills', []) + parsed_data.get('soft_skills', [])

    return {
        "raw_text": resume_text,
        "parsed_data": {
            "skills": all_skills,
            "projects": parsed_data.get('projects', []),
            "certifications": parsed_data.get('certifications', []),
            "languages": parsed_data.get('languages', []),
        },
        "filename": file.filename
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
