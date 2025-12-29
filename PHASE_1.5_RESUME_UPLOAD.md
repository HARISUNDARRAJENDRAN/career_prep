# Phase 1.5: Resume Upload & Parsing

## Overview
Enhance the onboarding flow with resume upload capability. This allows users to upload their PDF/DOCX resumes, which are then parsed using PyMuPDF to extract skills, experience, and education. These "claimed skills" are stored and later verified during the 1-hour Reality Check Interview.

## Critical Improvements (User Feedback Integration)

This plan has been enhanced with 4 critical improvements based on user feedback:

### 1. ✅ Review & Edit Confirmation UI (Step 3.5)
**Why**: AI parsing isn't 100% accurate. Users need to review and correct extracted skills before they hit the database.
**Solution**: Added `ResumeReviewStep` component with tag-cloud interface where users can remove incorrect skills or add missing ones before confirming.

### 2. ✅ Skill Normalization & Mapping (Step 4)
**Why**: Resume says "NodeJS," DB says "Node.js," job listing says "Node" → same skill, 3 different strings.
**Solution**: Built `normalizeSkills()` function using OpenAI to map resume skills to master catalog with synonym/variant detection. Stores normalization metadata for transparency.

### 3. ✅ Timeout Handling with Background Jobs (Step 5)
**Why**: Large PDFs or cold-start Python service can take 5-15 seconds, risking Next.js Server Action timeout.
**Solution**: Added 30-second timeout with `AbortController`. If exceeded, gracefully fallback to background job (Trigger.dev integration planned for Phase 3.5).

### 4. ✅ Security & Privacy Fixes (Security Section)
**Why**: Password-protected PDFs cause crashes. Public blob storage exposes PII (phone numbers, addresses).
**Solutions**:
- Added `is_encrypted` check to reject password-protected PDFs with clear error message
- Changed Vercel Blob from `access: 'public'` to `access: 'private'`
- Added MIME type validation, rate limiting, and optional PII redaction

## Why This Matters

### Current State (Phase 1)
- ✅ Users manually enter career goals, experience, education, and work history
- ✅ Data is saved step-by-step to PostgreSQL
- ❌ No baseline "claimed skills" from existing resume
- ❌ Manual entry is time-consuming and users might forget skills

### After Phase 1.5
- ✅ Users upload resume (PDF/DOCX)
- ✅ AI extracts skills, projects, certifications automatically
- ✅ Skills are added to `user_skills` table with `source: 'resume'` metadata
- ✅ Interview Agent uses resume data to ask targeted verification questions
- ✅ Truth Loop compares "Resume Claims" vs "Interview Performance"

## Integration with Interview System

```
┌──────────────────┐
│ Resume Upload    │
│ (Onboarding)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Skills Extracted & Stored            │
│ • user_skills.source = 'resume'      │
│ • verification_metadata.is_verified  │
│   = false (pending interview)        │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 1-Hour Reality Check Interview       │
│ (Hume AI - Phase 5)                  │
│ • Asks targeted questions about      │
│   resume-claimed skills               │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Truth Loop (Phase 5.5)               │
│ • Compares resume claims vs actual   │
│   interview performance              │
│ • Updates verification_metadata:     │
│   - resume_claim_validated: true/false│
│   - is_verified: true/false          │
└──────────────────────────────────────┘
```

## Database Schema Updates

### `user_profiles` Table
```typescript
// Add these fields to src/drizzle/schema/user-profiles.ts

// Resume storage
resume_url: text('resume_url'), // Vercel Blob or S3 URL
resume_filename: varchar('resume_filename', { length: 255 }),
resume_text: text('resume_text'), // Raw extracted text for RAG
resume_parsed_data: jsonb('resume_parsed_data').$type<{
  skills: string[];
  projects?: Array<{ title: string; description: string }>;
  certifications?: string[];
  languages?: string[];
}>(),
resume_uploaded_at: timestamp('resume_uploaded_at'),

// Vector DB integration (for Phase 3.6 - RAG/Digital Twin)
resume_is_embedded: boolean('resume_is_embedded').default(false).notNull(),
resume_embedded_at: timestamp('resume_embedded_at'),
resume_vector_metadata: jsonb('resume_vector_metadata').$type<{
  chunk_count?: number;
  embedding_model?: string; // e.g., "text-embedding-3-small"
  vector_ids?: string[]; // Pinecone/pgvector IDs for cleanup
  last_sync_hash?: string; // SHA256 of resume_text to detect changes
}>(),
```

### `user_skills.verification_metadata` Enhancement
```typescript
// Update existing verification_metadata structure
verification_metadata: {
  is_verified: boolean;
  source: 'resume' | 'manual' | 'interview'; // NEW
  claimed_at: string; // NEW
  resume_claim_validated?: boolean; // NEW - did interview confirm resume claim?
  needs_interview_focus?: boolean; // NEW - should interviewer probe this skill?
  verification_count: number;
  latest_proof?: {
    interview_id: string;
    timestamp: string;
    transcript_snippet: string;
    evaluator_confidence: number;
  };
}
```

## Implementation Steps

### Step 1: Install Dependencies

```bash
# Frontend (Next.js)
npm install @vercel/blob

# Backend (Python service for PDF parsing)
cd python-services/resume-parser
pip install fastapi uvicorn pymupdf python-docx openai python-multipart
```

### Step 2: Create Python Resume Parser Service

**File:** `python-services/resume-parser/app.py`

```python
from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pymupdf  # PyMuPDF
from docx import Document
import openai
import os
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

openai.api_key = os.getenv("OPENAI_API_KEY")

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

    response = openai.ChatCompletion.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a resume parsing assistant. Extract structured data from resumes and return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ],
        temperature=0,
    )

    content = response.choices[0].message.content
    return json.loads(content)

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
```

**File:** `python-services/resume-parser/requirements.txt`
```
fastapi==0.115.0
uvicorn[standard]==0.32.0
pymupdf==1.24.13
python-docx==1.1.2
openai==1.57.0
python-multipart==0.0.20
```

**File:** `python-services/resume-parser/Dockerfile`
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Step 3: Create Resume Upload Component

**File:** `src/components/onboarding/resume-upload-step.tsx`

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadResume, skipResume } from '@/app/onboarding/actions';
import { FileUp, Loader2 } from 'lucide-react';

interface ResumeUploadStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ResumeUploadStep({ onNext, onBack }: ResumeUploadStepProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.name.match(/\.(pdf|docx)$/i)) {
        setError('Only PDF and DOCX files are supported');
        return;
      }
      // Validate file size (5MB max)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  }

  function handleUpload() {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('resume', file);

      setUploadProgress('Uploading resume...');

      setTimeout(() => setUploadProgress('Extracting text...'), 1000);
      setTimeout(() => setUploadProgress('Analyzing skills with AI...'), 3000);

      const result = await uploadResume(formData);

      if (result.success) {
        if (result.parsedData) {
          // Navigate to review step with parsed data
          setUploadProgress('');
          // Pass parsed data to review step (handled in parent)
        }
        onNext();
      } else {
        setUploadProgress('');
        setError(result.error || 'Upload failed');
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipResume();
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Failed to skip');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Upload Your Resume (Optional)</CardTitle>
        <CardDescription>
          Upload your resume to auto-populate your skills and experience. We support PDF and DOCX files.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="resume">Resume File</Label>
          <Input
            id="resume"
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            disabled={isPending}
          />
          {file && (
            <p className="text-sm text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {uploadProgress && (
          <div className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploadProgress}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleSkip} disabled={isPending}>
              Skip
            </Button>
            <Button onClick={handleUpload} disabled={!file || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Upload & Continue
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 3.5: Review & Edit Confirmation UI (Critical UX)

**Problem**: AI parsing isn't 100% accurate. If the AI misreads "Java" as "JavaScript," users need to correct it before it hits the database.

**Solution**: Add a "Review & Edit" step after upload that shows extracted skills in an editable tag-cloud interface.

**File:** `src/components/onboarding/resume-review-step.tsx`

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X, Plus, CheckCircle2 } from 'lucide-react';
import { confirmResumeSkills } from '@/app/onboarding/actions';

interface ResumeReviewStepProps {
  extractedSkills: string[];
  projects?: Array<{ title: string; description: string }>;
  certifications?: string[];
  onNext: () => void;
  onBack: () => void;
}

export function ResumeReviewStep({
  extractedSkills,
  projects,
  certifications,
  onNext,
  onBack,
}: ResumeReviewStepProps) {
  const [skills, setSkills] = useState<string[]>(extractedSkills);
  const [newSkill, setNewSkill] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemoveSkill(skillToRemove: string) {
    setSkills(skills.filter((s) => s !== skillToRemove));
  }

  function handleAddSkill() {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmResumeSkills({ skills, projects, certifications });
      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Failed to save skills');
      }
    });
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Review Extracted Skills</CardTitle>
        <CardDescription>
          We extracted these skills from your resume. Remove incorrect ones or add any we missed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Skills Tag Cloud */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Skills ({skills.length})</h4>
          <div className="flex flex-wrap gap-2 min-h-[100px] p-4 border rounded-lg bg-muted/30">
            {skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills extracted. Add some below.</p>
            ) : (
              skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="px-3 py-1.5 text-sm">
                  {skill}
                  <button
                    onClick={() => handleRemoveSkill(skill)}
                    className="ml-2 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Add New Skill */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a skill..."
            value={newSkill}
            onChange={(e) => setNewSkill(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddSkill();
              }
            }}
          />
          <Button type="button" onClick={handleAddSkill} variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Projects Preview (Read-only for now) */}
        {projects && projects.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Projects ({projects.length})</h4>
            <div className="space-y-2">
              {projects.map((project, idx) => (
                <div key={idx} className="p-3 border rounded-lg bg-muted/20">
                  <p className="font-medium text-sm">{project.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications Preview */}
        {certifications && certifications.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Certifications ({certifications.length})</h4>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert) => (
                <Badge key={cert} variant="outline">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={onBack} disabled={isPending}>
            Back
          </Button>
          <Button onClick={handleConfirm} disabled={isPending || skills.length === 0}>
            {isPending ? 'Saving...' : 'Confirm & Continue'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Step 4: Skill Normalization & Mapping (Critical Architecture)

**Problem**: A resume might say "NodeJS," your DB might say "Node.js," and a job listing might say "Node." Without normalization, the same skill appears 3 different ways.

**Solution**: Use OpenAI to map "Claimed Skills" to your Master Skills Catalog with fuzzy matching and synonym detection.

**File:** `src/lib/skills-normalizer.ts`

```typescript
import { db } from '@/drizzle/db';
import { skills } from '@/drizzle/schema';
import { sql } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface NormalizedSkill {
  original: string;
  matched_skill_id: number | null;
  matched_skill_name: string | null;
  confidence: number;
  should_add_to_catalog: boolean;
}

/**
 * Normalize extracted resume skills to match master skills catalog
 * Uses OpenAI for intelligent matching with synonyms and variants
 */
export async function normalizeSkills(extractedSkills: string[]): Promise<NormalizedSkill[]> {
  // Fetch all existing skills from master catalog
  const masterSkills = await db.query.skills.findMany({
    columns: {
      id: true,
      name: true,
      category: true,
    },
  });

  const masterSkillNames = masterSkills.map((s) => s.name);

  // Use OpenAI to map extracted skills to master catalog
  const prompt = `You are a skill normalization assistant. Match the extracted skills to the master skills catalog.

**Extracted Skills (from resume):**
${extractedSkills.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Master Skills Catalog:**
${masterSkillNames.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For each extracted skill, find the best match in the master catalog. Consider:
- Exact matches (e.g., "Python" = "Python")
- Synonyms (e.g., "JS" = "JavaScript", "NodeJS" = "Node.js")
- Variants (e.g., "React.js" = "React", "Postgres" = "PostgreSQL")

Return ONLY valid JSON array with this format:
[
  {
    "original": "NodeJS",
    "matched_skill_name": "Node.js",
    "confidence": 0.95,
    "should_add_to_catalog": false
  },
  {
    "original": "Machine Learning",
    "matched_skill_name": null,
    "confidence": 0,
    "should_add_to_catalog": true
  }
]

Rules:
- confidence: 0-1 (1 = exact match, 0.7-0.9 = synonym/variant, <0.7 = no match)
- should_add_to_catalog: true if no good match found AND skill seems valid
- matched_skill_name: must be from Master Skills Catalog or null`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Cheaper model for this task
    messages: [
      {
        role: 'system',
        content: 'You are a skill normalization assistant. Return ONLY valid JSON arrays.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  const mappings = JSON.parse(content) as Array<{
    original: string;
    matched_skill_name: string | null;
    confidence: number;
    should_add_to_catalog: boolean;
  }>;

  // Convert skill names to IDs
  const normalized: NormalizedSkill[] = mappings.map((mapping) => {
    const matchedSkill = masterSkills.find((s) => s.name === mapping.matched_skill_name);

    return {
      original: mapping.original,
      matched_skill_id: matchedSkill?.id ?? null,
      matched_skill_name: mapping.matched_skill_name,
      confidence: mapping.confidence,
      should_add_to_catalog: mapping.should_add_to_catalog,
    };
  });

  return normalized;
}

/**
 * Add new skills to master catalog (admin review recommended)
 */
export async function addSkillsToCatalog(skillNames: string[], category: string = 'technical') {
  const newSkills = skillNames.map((name) => ({
    name,
    category,
    description: null,
  }));

  await db.insert(skills).values(newSkills).onConflictDoNothing();
}
```

### Step 5: Add Server Actions with Normalization

**File:** `src/app/onboarding/actions.ts` (add to existing file)

```typescript
import { put } from '@vercel/blob';
import { inArray } from 'drizzle-orm';
import { normalizeSkills } from '@/lib/skills-normalizer';
import crypto from 'crypto'; // For resume change detection

/**
 * Upload resume and trigger background parsing job
 * Returns immediately to prevent timeout on large files
 */
export async function uploadResume(formData: FormData): Promise<ActionResult & { parsedData?: any }> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  const file = formData.get('resume') as File;
  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  try {
    // Ensure user exists
    await ensureUserExists(userId);

    // Upload to Vercel Blob with PRIVATE access (Security Fix)
    const blob = await put(`resumes/${userId}/${file.name}`, file, {
      access: 'private', // Changed from 'public' - resumes contain PII
      addRandomSuffix: true,
    });

    // Send to Python parsing service with timeout handling
    const parseFormData = new FormData();
    parseFormData.append('file', file);

    // Use AbortController for timeout (30 seconds max for synchronous parsing)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const parseResponse = await fetch(
        process.env.RESUME_PARSER_URL || 'http://localhost:8001/parse-resume',
        {
          method: 'POST',
          body: parseFormData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!parseResponse.ok) {
        const errorData = await parseResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to parse resume');
      }

      const { raw_text, parsed_data } = await parseResponse.json();

      // Update user profile with resume data
      await db
        .update(userProfiles)
        .set({
          resume_url: blob.url,
          resume_filename: file.name,
          resume_text: raw_text,
          resume_parsed_data: parsed_data,
          resume_uploaded_at: new Date(),
          updated_at: new Date(),
          // Initialize Vector DB flags (Phase 3.6 integration)
          resume_is_embedded: false, // Not yet processed into Vector DB
          resume_embedded_at: null,
          resume_vector_metadata: {
            last_sync_hash: crypto.createHash('sha256').update(raw_text).digest('hex'),
          },
        })
        .where(eq(userProfiles.user_id, userId));

      // Return parsed data for review step (don't insert into DB yet)
      return {
        success: true,
        parsedData: parsed_data,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        // Timeout - trigger background job instead
        console.log('Resume parsing timeout, triggering background job...');

        // TODO: Trigger background job using Trigger.dev (Phase 3.5)
        // await triggerResumeParsingJob({ userId, blobUrl: blob.url });

        return {
          success: false,
          error: 'Resume is too large. We will process it in the background and notify you via email.',
        };
      }

      throw fetchError;
    }
  } catch (error: any) {
    console.error('Error uploading resume:', error);
    return { success: false, error: error.message || 'Failed to upload resume' };
  }
}

/**
 * Confirm reviewed skills and insert into database with normalization
 */
export async function confirmResumeSkills(data: {
  skills: string[];
  projects?: Array<{ title: string; description: string }>;
  certifications?: string[];
}): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // Normalize skills to match master catalog
    const normalizedSkills = await normalizeSkills(data.skills);

    // Insert user skills with normalization metadata
    for (const normalizedSkill of normalizedSkills) {
      if (normalizedSkill.matched_skill_id) {
        await db
          .insert(userSkills)
          .values({
            user_id: userId,
            skill_id: normalizedSkill.matched_skill_id,
            proficiency_level: 'intermediate', // Default, will be verified in interview
            verification_metadata: {
              is_verified: false,
              source: 'resume',
              claimed_at: new Date().toISOString(),
              resume_claim_validated: null, // Pending interview
              needs_interview_focus: normalizedSkill.confidence < 0.8, // Flag low-confidence matches
              normalization_metadata: {
                original_claim: normalizedSkill.original,
                normalized_to: normalizedSkill.matched_skill_name,
                confidence: normalizedSkill.confidence,
              },
            },
          })
          .onConflictDoNothing();
      } else if (normalizedSkill.should_add_to_catalog) {
        // Skill not in catalog - optionally auto-add or flag for review
        console.log(`New skill detected: ${normalizedSkill.original} (flagged for admin review)`);
        // TODO: Store in pending_skills table for admin approval
      }
    }

    // Update user profile with projects and certifications
    await db
      .update(userProfiles)
      .set({
        resume_parsed_data: sql`
          COALESCE(resume_parsed_data, '{}'::jsonb) ||
          ${JSON.stringify({ projects: data.projects, certifications: data.certifications })}::jsonb
        `,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, userId));

    // Mark onboarding step as complete
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error confirming resume skills:', error);
    return { success: false, error: 'Failed to save skills' };
  }
}

export async function skipResume(): Promise<ActionResult> {
  const { userId } = await auth();

  if (!userId) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    await db
      .update(users)
      .set({
        onboarding_step: ONBOARDING_STEPS.COMPLETE,
        updated_at: new Date(),
      })
      .where(eq(users.clerk_id, userId));

    return { success: true };
  } catch (error) {
    console.error('Error skipping resume:', error);
    return { success: false, error: 'Failed to skip resume' };
  }
}
```

### Step 5: Update Onboarding Wizard

**File:** `src/lib/validations/onboarding.ts`

```typescript
// Update ONBOARDING_STEPS constant
export const ONBOARDING_STEPS = {
  WELCOME: 0,
  CAREER_GOALS: 1,
  EXPERIENCE: 2,
  EDUCATION: 3,
  WORK_HISTORY: 4,
  RESUME: 5,  // NEW
  COMPLETE: 6, // Changed from 5 to 6
} as const;

// Update STEP_LABELS
export const STEP_LABELS: Record<OnboardingStep, string> = {
  [ONBOARDING_STEPS.WELCOME]: 'Welcome',
  [ONBOARDING_STEPS.CAREER_GOALS]: 'Career Goals',
  [ONBOARDING_STEPS.EXPERIENCE]: 'Experience',
  [ONBOARDING_STEPS.EDUCATION]: 'Education',
  [ONBOARDING_STEPS.WORK_HISTORY]: 'Work History',
  [ONBOARDING_STEPS.RESUME]: 'Resume Upload', // NEW
  [ONBOARDING_STEPS.COMPLETE]: 'Complete',
};
```

**File:** `src/components/onboarding/onboarding-wizard.tsx`

```typescript
// Add to imports
import { ResumeUploadStep } from './resume-upload-step';

// Update totalSteps
const totalSteps = 5; // Changed from 4 to 5

// Update stepItems array
const stepItems = [
  { step: ONBOARDING_STEPS.CAREER_GOALS, label: 'Career Goals' },
  { step: ONBOARDING_STEPS.EXPERIENCE, label: 'Experience' },
  { step: ONBOARDING_STEPS.EDUCATION, label: 'Education' },
  { step: ONBOARDING_STEPS.WORK_HISTORY, label: 'Work History' },
  { step: ONBOARDING_STEPS.RESUME, label: 'Resume' }, // NEW
];

// Add to render logic (before CompleteStep)
{currentStep === ONBOARDING_STEPS.RESUME && (
  <ResumeUploadStep onNext={goToNext} onBack={goToPrev} />
)}
```

### Step 6: Update Environment Variables

**File:** `.env.local`

```env
# Vercel Blob (for resume storage)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# Resume Parser Service
RESUME_PARSER_URL=http://localhost:8001

# OpenAI (for resume parsing)
OPENAI_API_KEY=your_openai_key
```

### Step 7: Run Python Service Locally

```bash
cd python-services/resume-parser
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start service
uvicorn app:app --reload --port 8001
```

## Testing Checklist

### Core Functionality
- [ ] Upload PDF resume → verify skills extracted
- [ ] Upload DOCX resume → verify skills extracted
- [ ] Upload password-protected PDF → verify error message shown
- [ ] Upload corrupted PDF → verify error handled gracefully
- [ ] Skip resume → verify onboarding completes successfully

### Database Verification
- [ ] Check `user_profiles.resume_url` is populated with **private** blob URL
- [ ] Check `user_profiles.resume_text` contains extracted text
- [ ] Check `user_profiles.resume_parsed_data` has skills array
- [ ] **Verify `resume_is_embedded` = false** (ready for Phase 3.6)
- [ ] **Verify `resume_vector_metadata` = null** (not yet embedded)
- [ ] Check `user_skills` table has entries with `source: 'resume'`
- [ ] Verify normalization_metadata is stored in verification_metadata

### UX & Validation
- [ ] Verify skill normalization: "NodeJS" → "Node.js" mapping works
- [ ] Verify review & edit UI: can add/remove skills before saving
- [ ] Test file size validation (>5MB should fail)
- [ ] Test file type validation (only PDF/DOCX allowed)
- [ ] Test MIME type validation (not just extension check)

### Performance & Error Handling
- [ ] Test timeout handling: upload large file (>30s processing time)
- [ ] Verify loading states: "Uploading resume..." → "Extracting text..." → "Analyzing skills..."
- [ ] Test network failure recovery during upload

## Security & Privacy Considerations

### 1. Password-Protected PDFs (Security Fix)
**Issue**: PyMuPDF throws unhandled exceptions when encountering password-protected PDFs.

**Fix**: Added `is_encrypted` check before parsing:
```python
if doc.is_encrypted:
    raise HTTPException(
        status_code=400,
        detail="Password-protected PDFs are not supported. Please remove the password and try again."
    )
```

### 2. Private Blob Storage (Privacy Fix)
**Issue**: Original plan used `access: 'public'` for Vercel Blob, exposing resumes with PII (phone numbers, addresses).

**Fix**: Changed to `access: 'private'`:
```typescript
const blob = await put(`resumes/${userId}/${file.name}`, file, {
  access: 'private', // Only accessible via signed URLs
  addRandomSuffix: true, // Prevents filename enumeration
});
```

**How to Access Private Blobs**:
```typescript
import { head } from '@vercel/blob';

// Generate signed URL for download (expires in 1 hour)
const { url } = await head(resumeUrl);
// Use this URL to download the file securely
```

### 3. Additional Security Measures

**Rate Limiting**: Add Arcjet rules to prevent abuse:
```typescript
import { arcjet, shield, detectBot } from '@/lib/arcjet';

export async function uploadResume(formData: FormData) {
  // Apply rate limiting: 3 uploads per hour per user
  const aj = arcjet.withRule(
    rateLimit({
      mode: 'LIVE',
      characteristics: ['userId'],
      max: 3,
      window: '1h',
    })
  );

  const decision = await aj.protect(request, { userId });
  if (decision.isDenied()) {
    return { success: false, error: 'Too many uploads. Try again later.' };
  }

  // ... rest of upload logic
}
```

**File Type Validation**: Verify MIME type (not just extension):
```typescript
const validMimeTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

if (!validMimeTypes.includes(file.type)) {
  return { success: false, error: 'Invalid file type. Only PDF and DOCX are allowed.' };
}
```

**PII Redaction**: Consider redacting sensitive info from `resume_text` before storing:
```typescript
// Optional: Use regex to remove phone numbers, emails, addresses
const redactedText = raw_text
  .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE_REDACTED]')
  .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]');
```

## Production Deployment

### Python Service
Deploy the resume parser as a separate service:

**Option 1: Railway**
```bash
railway init
railway up
```

**Option 2: Fly.io**
```bash
fly launch
fly deploy
```

**Option 3: Google Cloud Run**
```bash
gcloud run deploy resume-parser --source .
```

Update `RESUME_PARSER_URL` in production environment to point to deployed service.

## Future Enhancements (Post-MVP)

### Phase 3.6 Integration: Vector DB Embedding Pipeline

**Why We Added `resume_is_embedded`:**
When Phase 3.6 (Vector DB) is implemented, the system will need to know which resumes have already been chunked and embedded. This flag prevents duplicate processing.

**Workflow:**
```
┌─────────────────────────────────────────────────────────┐
│ Phase 1.5: Resume Upload                                │
│ • resume_text saved to PostgreSQL                       │
│ • resume_is_embedded = false                            │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 3.6: Background Job (Trigger.dev)                 │
│ 1. Check: if resume_is_embedded = true → skip           │
│ 2. Chunk resume_text into semantic blocks               │
│ 3. Generate embeddings (OpenAI text-embedding-3-small)  │
│ 4. Store in Vector DB with metadata:                    │
│    - user_id, chunk_text, embedding_vector              │
│    - source: "resume", section: "experience/skills"     │
│ 5. Update user_profiles:                                │
│    - resume_is_embedded = true                          │
│    - resume_vector_metadata = { chunk_count, vector_ids }│
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│ Phase 7: Digital Twin / Action Agent                    │
│ • Semantic search resume for job application answers    │
│ • "Tell me about your React experience" → RAG lookup    │
│   retrieves relevant chunks from Vector DB              │
└─────────────────────────────────────────────────────────┘
```

**Example: Detecting Resume Updates**
```typescript
// When user re-uploads resume, check if content changed
import crypto from 'crypto';

const newHash = crypto.createHash('sha256').update(raw_text).digest('hex');
const existingHash = profile.resume_vector_metadata?.last_sync_hash;

if (newHash !== existingHash) {
  // Content changed - need to re-embed
  await db.update(userProfiles).set({
    resume_is_embedded: false, // Trigger re-embedding
    resume_vector_metadata: null, // Clear old vector IDs
  });
}
```

**Cost Savings:**
- Without flag: Re-embed resume on every Action Agent query (~$0.0001/request × 100s of jobs = wasted cost)
- With flag: Embed once, reuse forever (one-time cost of ~$0.0004 per resume)

---

### Other Future Enhancements

1. **Resume Version Control**: Store multiple resume versions
2. **Resume Builder**: Let users edit/update resume in-app
3. **Resume Export**: Generate updated resume after skill verifications
4. **ATS Optimization**: Analyze resume for ATS compatibility
5. **Resume Embeddings**: Store resume chunks in Vector DB for RAG

## Cost Estimate

- **Vercel Blob Storage**: $0.15/GB (~$0.001 per resume)
- **OpenAI API** (GPT-4o for parsing): ~$0.01 per resume
- **Python Service** (Railway/Fly.io): $5-10/month

**Total**: ~$0.02 per user + $5-10/month hosting
