# ML Pipeline Skill — Plotline Two-Tower Recommendation System

## Overview
This skill covers working with the ML pipeline in `/ml/`. The system is a **two-tower retrieval model** built in PyTorch for personalized book recommendations. Use this skill when the user asks about training, evaluating, serving, or debugging the recommendation model.

---

## Architecture

```
User Features                    Book Features
(history, genres, clubs)         (title, authors, genres, rating)
        │                                │
   ┌────▼─────┐                   ┌──────▼──────┐
   │ User     │                   │  Item        │
   │ Tower    │                   │  Tower       │
   │ (MLP)    │                   │  (MLP)       │
   └────┬─────┘                   └──────┬───────┘
        │  user_embedding                │  book_embedding
        │         (64-dim, L2 normed)    │
        └──────────────┬─────────────────┘
                       │
              dot product similarity
                       │
              InfoNCE loss (training)
              ANN search  (inference)
```

**Two towers trained jointly** with in-batch negative sampling. At inference, book embeddings are pre-computed and stored in an in-memory index (swap for FAISS at scale).

---

## Key Files

| File | Purpose |
|------|---------|
| `ml/src/models/two_tower/model.py` | Main TwoTowerModel — combines towers, computes loss |
| `ml/src/models/two_tower/user_tower.py` | Encodes user context → embedding |
| `ml/src/models/two_tower/item_tower.py` | Encodes book metadata → embedding |
| `ml/src/training/trainer.py` | Training loop, checkpointing, WandB logging |
| `ml/src/training/config.py` | All hyperparameters via dataclasses |
| `ml/src/data/dataset.py` | PyTorch datasets + negative sampling |
| `ml/src/data/preprocessing.py` | Supabase data → normalized feature tensors |
| `ml/src/evaluation/metrics.py` | Recall@K, NDCG@K, MRR, Hit Rate |
| `ml/src/serving/api.py` | FastAPI endpoints: /recommend, /similar |
| `ml/src/serving/embeddings.py` | In-memory ANN index for book embeddings |
| `ml/configs/default.yaml` | Default hyperparameter config |
| `ml/Makefile` | Commands: train, eval, serve, test |

---

## Common Tasks

### Setup
```bash
cd ml/
pip install -r requirements.txt
```

### Train the model
```bash
make train
# or with custom config:
python -m src.training.trainer --config configs/default.yaml
```

### Evaluate
```bash
make eval
# Outputs: recall@5, recall@10, ndcg@10, ndcg@20, mrr, hit_rate@10
```

### Serve locally
```bash
make serve
# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Run tests
```bash
make test
# pytest tests/ -v
```

### Check a recommendation (curl)
```bash
curl -X POST http://localhost:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "abc123",
    "reading_history": ["book_id_1", "book_id_2"],
    "genre_preferences": ["fiction", "mystery"],
    "top_k": 10
  }'
```

---

## Data Pipeline

**Source:** Supabase tables → export as CSV → preprocess → tensors

```
Supabase
  ├── saved_books  → interactions.csv  (user_id, book_id, timestamp)
  ├── clubs        → user features (club membership, book choices)
  └── trending_books → item popularity signals

ml/data/raw/
  ├── interactions.csv
  ├── books.csv
  └── users.csv

ml/data/processed/
  ├── user_features.pt
  ├── item_features.pt
  └── splits/
      ├── train.csv
      ├── val.csv
      └── test.csv
```

**Export from Supabase:**
```sql
-- In Supabase SQL editor → download CSV
COPY (SELECT user_id, book_id, created_at FROM saved_books ORDER BY created_at)
TO STDOUT WITH CSV HEADER;
```

---

## Hyperparameters (configs/default.yaml)

| Param | Default | Notes |
|-------|---------|-------|
| `output_dim` | 64 | Final embedding size for both towers |
| `hidden_dims` | [256, 128] | MLP layers in each tower |
| `temperature` | 0.07 | InfoNCE temperature (lower = sharper) |
| `num_negatives` | 4 | In-batch negatives per positive |
| `batch_size` | 256 | Larger = more negatives per step |
| `learning_rate` | 1e-3 | Adam optimizer |
| `text_encoder` | all-MiniLM-L6-v2 | Sentence transformer for book text |

---

## Evaluation Targets

Good baselines for book recommendation (cold start excluded):

| Metric | Target |
|--------|--------|
| Recall@10 | > 0.15 |
| NDCG@10 | > 0.10 |
| Hit Rate@10 | > 0.25 |
| MRR | > 0.08 |

---

## Deployment

### Current: local FastAPI server
```bash
make serve
```

### Future: Vercel AI / Modal / Railway
The API is a standard FastAPI app. For cloud deployment:
1. Containerize with `Dockerfile` (add when ready)
2. Deploy to Railway or Modal for GPU inference
3. Set `RECOMMENDATION_API_URL` env var in the Next.js web app
4. Call from `web/src/features/recommendations/` hooks

### Web app integration point
The web app calls the recommendation API from:
```
web/src/features/recommendations/useRecommendations.ts
```
This hook hits `/recommend` with the current user's reading history and returns personalized book suggestions for the Home page.

---

## WandB Logging (optional)
```bash
wandb login  # one-time setup
# Then in config: use_wandb: true
make train
# View at https://wandb.ai/your-project/plotline-rec
```

---

## Debugging Tips

**Model not learning:**
- Check `temperature` — too high (>0.2) makes loss flat
- Check that user/item embeddings are L2-normalized before dot product
- Verify negatives are actually negative (no false negatives in batch)

**Slow training:**
- Increase `batch_size` (more in-batch negatives = better signal per step)
- Pre-compute text embeddings offline (don't run sentence transformer in the training loop)

**Serving latency high:**
- Pre-compute ALL book embeddings at startup, store in `EmbeddingIndex`
- For >100k books: swap `EmbeddingIndex` for FAISS with `IndexFlatIP`

**Low recall:**
- Add hard negative mining after epoch 5+
- Increase `num_negatives`
- Check data quality — are "saved books" reliable positive signals?
