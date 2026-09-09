import os
import urllib.request
import zipfile
import pandas as pd
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.metrics.pairwise import cosine_similarity

import ssl

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
MOVIELENS_URL = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "../MovieNightBackend/src/main/resources/data/movie_similarity.csv")

def download_and_extract():
    os.makedirs(DATA_DIR, exist_ok=True)
    zip_path = os.path.join(DATA_DIR, "ml-latest-small.zip")
    if not os.path.exists(zip_path):
        print("Downloading MovieLens ml-latest-small dataset...")
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(MOVIELENS_URL, context=ctx) as response, open(zip_path, 'wb') as out_file:
            out_file.write(response.read())
        print("Extracting dataset...")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(DATA_DIR)
        print("Extraction complete.")

def compute_similarity():
    download_and_extract()
    ml_dir = os.path.join(DATA_DIR, "ml-latest-small")
    
    print("Loading ratings.csv and links.csv...")
    ratings = pd.read_csv(os.path.join(ml_dir, "ratings.csv"))
    links = pd.read_csv(os.path.join(ml_dir, "links.csv"))
    
    # 1. Clean links and map movieId -> tmdbId
    links = links.dropna(subset=['tmdbId'])
    links['tmdbId'] = links['tmdbId'].astype(int)
    movie_to_tmdb = dict(zip(links['movieId'], links['tmdbId']))
    
    # Filter ratings to only movies with valid TMDB IDs
    ratings = ratings[ratings['movieId'].isin(movie_to_tmdb)].copy()
    ratings['tmdbId'] = ratings['movieId'].map(movie_to_tmdb)
    
    # 2. Build index mappings for sparse matrix
    unique_users = ratings['userId'].unique()
    unique_tmdb = ratings['tmdbId'].unique()
    
    user_to_idx = {uid: i for i, uid in enumerate(unique_users)}
    tmdb_to_idx = {tid: i for i, tid in enumerate(unique_tmdb)}
    idx_to_tmdb = {i: tid for i, tid in enumerate(unique_tmdb)}
    
    row_indices = [tmdb_to_idx[tid] for tid in ratings['tmdbId']]
    col_indices = [user_to_idx[uid] for uid in ratings['userId']]
    values = ratings['rating'].values
    
    # 3. Create sparse Item-User matrix: (num_movies x num_users)
    item_user_sparse = csr_matrix(
        (values, (row_indices, col_indices)),
        shape=(len(unique_tmdb), len(unique_users)),
        dtype=np.float32
    )
    
    print(f"Computing Cosine Similarity for {len(unique_tmdb)} movies across {len(unique_users)} users (sparsity: {100 - (len(values) / (len(unique_tmdb)*len(unique_users)) * 100):.2f}%)...")
    similarity_matrix = cosine_similarity(item_user_sparse, dense_output=False)
    
    # 4. Extract Top 30 Neighbors per movie
    records = []
    TOP_K = 30
    MIN_SIMILARITY = 0.10
    
    for i in range(len(unique_tmdb)):
        row = similarity_matrix.getrow(i).toarray().flatten()
        row[i] = 0.0  # Ignore self-similarity
        
        # Get top-k indices with highest similarity
        if len(row) > TOP_K:
            top_indices = np.argpartition(row, -TOP_K)[-TOP_K:]
            top_indices = top_indices[np.argsort(-row[top_indices])]
        else:
            top_indices = np.argsort(-row)
        
        tmdb_id = idx_to_tmdb[i]
        for neighbor_idx in top_indices:
            score = float(row[neighbor_idx])
            if score >= MIN_SIMILARITY:
                neighbor_tmdb_id = idx_to_tmdb[neighbor_idx]
                records.append({
                    "tmdb_id": tmdb_id,
                    "neighbor_tmdb_id": neighbor_tmdb_id,
                    "score": round(score, 4)
                })
    
    df_out = pd.DataFrame(records)
    out_dir = os.path.dirname(OUTPUT_FILE)
    os.makedirs(out_dir, exist_ok=True)
    df_out.to_csv(OUTPUT_FILE, index=False)
    print(f"Successfully saved {len(df_out)} similarity neighbor pairs to {OUTPUT_FILE}")

if __name__ == "__main__":
    compute_similarity()
