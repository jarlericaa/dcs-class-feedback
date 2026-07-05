# AI Future Plan

> **Status:** Planning / pre-implementation. **AI is post-MVP and low priority.** Nothing here is an MVP requirement.
> This document **owns** the AI direction and its hard constraints, plus the (small) things MVP should do now to stay AI-ready.
> Label key as in [product-requirements.md](product-requirements.md).

## 1. Position **[Confirmed]**

AI is **post-MVP and low priority**. Do not build AI features, AI infrastructure, dedicated vector databases, standalone AI services, or model fine-tuning as part of MVP ([mvp-scope.md](mvp-scope.md)).

## 2. Hard constraints (apply whenever AI is built) **[Confirmed]**

- AI must **never automatically send or publish** answers.
- Teachers must **explicitly approve** and may **edit** all AI output.
- **Student names, numbers, and identities must never be sent to AI services** (Risk R8). Enforced at the AI boundary — AI operates on de-identified content only.

## 3. Potential future AI features **[Confirmed — future]**

Suggest one answer draft · rewrite a student question · improve clarity · summarize feedback · suggest categories · detect similar questions · retrieve course materials · search external sources · fact-check teacher-written drafts · fact-check AI-generated drafts · provide citations · adapt to teacher style.

All are **assistive** — a human approves before anything reaches a student.

## 4. Retrieval (RAG), not fine-tuning **[Confirmed]**

Future AI retrieval may use lecture slides, PDFs, readings, syllabus documents, teacher notes, approved websites, and external search when course materials are insufficient.

- Use **retrieval-augmented generation**, not model fine-tuning.
- **Do not** initially require a dedicated vector database, AI microservice, or per-teacher model.
- Course materials belong to reusable **courses** and may support multiple sections.

## 5. Teacher-style adaptation **[Confirmed]**

Based on: teacher-defined tone preferences, preferred answer length, preferred terminology, formatting preferences, approved answer examples, and teacher corrections/ratings.

- **Separate teacher writing style from course factual knowledge.** Style guides *how* to write; retrieval provides *what* is true.
- Teacher approval remains mandatory.

## 6. Fact-checking **[Confirmed]**

Future fact-checking may compare teacher-written or AI-generated drafts against uploaded course materials, teacher-approved sources, and reputable external sources.

The fact-checker should: **cite evidence**, **explain uncertainty**, **distinguish unsupported claims from false claims**, and **warn rather than block** publication.

## 7. What MVP does now to stay AI-ready **[Recommended]**

No AI is built, but a few cheap modeling choices keep the door open without adding infrastructure:

- Keep clean, structured content: category (Content/Logistics/Misc) and lesson/topic tags on questions ([weekly-form-workflow.md](weekly-form-workflow.md), [domain-model.md](domain-model.md)).
- Reserve course-level ownership + topic tagging so a future `CourseMaterial` entity attaches cleanly ([domain-model.md](domain-model.md)) — **without** building material management in MVP.
- Preserve original question text immutably (already required) — useful for future rewrite/summarize features.
- Keep a de-identification seam in mind: content and identity are already separated in the model, which is exactly what the "no student identity to AI" constraint needs.

## 8. Related documents

[mvp-scope.md](mvp-scope.md) · [domain-model.md](domain-model.md) · [public-qa-and-source-linking.md](public-qa-and-source-linking.md) · [architecture-proposal.md](architecture-proposal.md) · [product-requirements.md](product-requirements.md)
