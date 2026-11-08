import os
import sys
import ssl
import json
import hashlib
import zipfile
import urllib.request
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
import importlib.metadata

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.join(SCRIPT_DIR, "data", "ml-latest")
MOVIELENS_URL = "https://files.grouplens.org/datasets/movielens/ml-latest.zip"
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "../MovieNightBackend/src/main/resources/data")
OUTPUT_CSV = os.path.join(OUTPUT_DIR, "movie_similarity.csv")
OUTPUT_MANIFEST = os.path.join(OUTPUT_DIR, "movie_similarity.manifest.json")
OUTPUT_ATTRIBUTION = os.path.join(OUTPUT_DIR, "MOVIELENS_ATTRIBUTION.txt")

ATTRIBUTION_TEXT = """MovieLens Dataset Attribution Notice
=======================================
This product incorporates movie rating patterns and similarity vectors derived
from the MovieLens ml-latest dataset, generated and maintained by the GroupLens
Research Group at the University of Minnesota.

Source: https://grouplens.org/datasets/movielens/
Citation: F. Maxwell Harper and Joseph A. Konstan. 2015. The MovieLens Datasets:
History and Context. ACM Transactions on Interactive Intelligent Systems (TiiS) 5, 4: 19:1–19:19.

Redistribution & Usage Terms:
- The data is provided for research and educational purposes.
- GroupLens does not endorse or sponsor this application or the derived recommendations.
- Raw datasets are excluded from version control and distributed artifacts.
"""

def sha256_file(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def validate_inputs(data_dir: str) -> tuple[str, str]:
    os.makedirs(data_dir, exist_ok=True)
    ratings_path = os.path.join(data_dir, "ratings.csv")
    links_path = os.path.join(data_dir, "links.csv")

    has_ratings = os.path.isfile(ratings_path)
    has_links = os.path.isfile(links_path)

    if has_ratings and has_links:
        return ratings_path, links_path

    if has_ratings != has_links:
        raise ValueError(f"Incomplete input: exactly one of ratings.csv/links.csv is present in {data_dir}. Halting.")

    # Neither exists: check for cached zip or download
    parent_dir = os.path.dirname(data_dir)
    cached_zip = os.path.join(parent_dir, "ml-latest.zip")
    if not os.path.isfile(cached_zip):
        cached_zip = os.path.join(data_dir, "ml-latest.zip")

    if not (os.path.isfile(cached_zip) and zipfile.is_zipfile(cached_zip)):
        print(f"Downloading MovieLens ml-latest dataset from {MOVIELENS_URL} using verified HTTPS...")
        zip_tmp = os.path.join(parent_dir, "ml-latest.zip.tmp")
        ctx = ssl.create_default_context()
        req = urllib.request.Request(MOVIELENS_URL, headers={"User-Agent": "MovieNight-SimilarityTrainer/1.0"})
        with urllib.request.urlopen(req, context=ctx) as response, open(zip_tmp, "wb") as out_file:
            while chunk := response.read(1024 * 1024):
                out_file.write(chunk)
        cached_zip = os.path.join(parent_dir, "ml-latest.zip")
        os.replace(zip_tmp, cached_zip)
        print("Download complete.")

    print(f"Extracting ratings.csv and links.csv from {cached_zip}...")
    with zipfile.ZipFile(cached_zip, "r") as z:
        for member in z.namelist():
            filename = os.path.basename(member)
            if filename in ("ratings.csv", "links.csv"):
                source = z.open(member)
                target_path = os.path.join(data_dir, filename)
                target_tmp = target_path + ".tmp"
                with open(target_tmp, "wb") as target:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
                os.replace(target_tmp, target_path)

    if not (os.path.isfile(ratings_path) and os.path.isfile(links_path)):
        raise RuntimeError("Failed to extract required ratings.csv and links.csv from archive.")

    return ratings_path, links_path

def clean_and_deduplicate(ratings_path: str, links_path: str) -> tuple[pd.DataFrame, dict]:
    print(f"Loading links from {links_path}...")
    links_df = pd.read_csv(links_path, dtype={"movieId": int, "imdbId": object, "tmdbId": object})
    required_link_cols = {"movieId", "imdbId", "tmdbId"}
    if not required_link_cols.issubset(links_df.columns):
        raise ValueError(f"links.csv missing required columns: {required_link_cols - set(links_df.columns)}")

    total_links = len(links_df)
    
    # Parse tmdbId to numeric
    links_df["tmdbId_numeric"] = pd.to_numeric(links_df["tmdbId"], errors="coerce")
    valid_links_mask = links_df["tmdbId_numeric"].notna() & (links_df["tmdbId_numeric"] > 0)
    excluded_links_count = int((~valid_links_mask).sum())

    valid_links = links_df[valid_links_mask].copy()
    valid_links["tmdbId"] = valid_links["tmdbId_numeric"].astype(int)

    # Check for inconsistent mapping: single movieId mapped to multiple different TMDB IDs
    inconsistent = valid_links.groupby("movieId")["tmdbId"].nunique()
    if (inconsistent > 1).any():
        bad_movie_ids = inconsistent[inconsistent > 1].index.tolist()
        raise ValueError(f"Inconsistent TMDB mapping: movieIds {bad_movie_ids[:5]} map to multiple distinct TMDB IDs")

    movie_to_tmdb = dict(zip(valid_links["movieId"], valid_links["tmdbId"]))
    valid_mapping_count = len(movie_to_tmdb)
    duplicate_mappings_count = int(valid_links.duplicated(subset=["movieId"]).sum())

    print(f"Loading ratings from {ratings_path}...")
    ratings_df = pd.read_csv(ratings_path, dtype={"userId": int, "movieId": int, "rating": float, "timestamp": int})
    required_rating_cols = {"userId", "movieId", "rating", "timestamp"}
    if not required_rating_cols.issubset(ratings_df.columns):
        raise ValueError(f"ratings.csv missing required columns: {required_rating_cols - set(ratings_df.columns)}")

    total_ratings = len(ratings_df)

    # Validate ratings are within half-star 0.5-5.0 scale
    invalid_ratings = (ratings_df["rating"] < 0.5) | (ratings_df["rating"] > 5.0) | (ratings_df["rating"].isna())
    if invalid_ratings.any():
        raise ValueError(f"Found {invalid_ratings.sum()} invalid rating values outside 0.5-5.0 scale")

    # Map ratings to tmdbId and exclude unmapped
    ratings_df["tmdbId"] = ratings_df["movieId"].map(movie_to_tmdb)
    mapped_mask = ratings_df["tmdbId"].notna()
    excluded_unmapped_ratings = int((~mapped_mask).sum())
    ratings_df = ratings_df[mapped_mask].copy()
    ratings_df["tmdbId"] = ratings_df["tmdbId"].astype(int)

    # Deduplicate: latest timestamp wins, tie broken by smallest movieId
    # Sort deterministically: userId asc, tmdbId asc, timestamp desc, movieId asc
    ratings_df = ratings_df.sort_values(
        by=["userId", "tmdbId", "timestamp", "movieId"],
        ascending=[True, True, False, True]
    )

    # Detect conflicting tied records (same userId, tmdbId, timestamp, movieId with DIFFERENT ratings)
    tied_conflicts = ratings_df.groupby(["userId", "tmdbId", "timestamp", "movieId"])["rating"].nunique()
    if (tied_conflicts > 1).any():
        raise ValueError("Conflicting rating records tied for winning latest timestamp and smallest movieId")

    # Retain the winning row per (userId, tmdbId)
    cleaned = ratings_df.drop_duplicates(subset=["userId", "tmdbId"], keep="first")[["userId", "tmdbId", "rating"]].copy()

    stats = {
        "total_links": total_links,
        "valid_tmdb_mappings": valid_mapping_count,
        "excluded_links": excluded_links_count,
        "duplicate_mappings": duplicate_mappings_count,
        "total_raw_ratings": total_ratings,
        "excluded_unmapped_ratings": excluded_unmapped_ratings,
        "retained_unique_ratings": len(cleaned),
        "unique_users": int(cleaned["userId"].nunique()),
        "unique_tmdb_movies": int(cleaned["tmdbId"].nunique())
    }
    print(f"Data cleaning complete: {len(cleaned)} unique user-movie ratings across {stats['unique_tmdb_movies']} TMDB movies.")
    return cleaned, stats

def compute_item_similarities(
    df: pd.DataFrame,
    output_path: str,
    chunk_size: int = 500,
    min_similarity: float = 0.10,
    top_k: int = 30
) -> dict:
    import gc
    unique_users = np.sort(df["userId"].unique())
    unique_tmdb = np.sort(df["tmdbId"].unique())

    print(f"Building sparse item-user matrix: {len(unique_tmdb)} items x {len(unique_users)} users...")
    cat_tmdb = pd.Categorical(df["tmdbId"], categories=unique_tmdb)
    row_indices = cat_tmdb.codes.astype(np.int32)
    cat_user = pd.Categorical(df["userId"], categories=unique_users)
    col_indices = cat_user.codes.astype(np.int32)
    values = df["rating"].values.astype(np.float32)

    csr = csr_matrix((values, (row_indices, col_indices)), shape=(len(unique_tmdb), len(unique_users)), dtype=np.float32)

    # Free dataframe and temporary arrays to bound peak memory
    del df, cat_tmdb, cat_user, row_indices, col_indices, values
    gc.collect()

    print("Computing row L2 norms and normalizing sparse item vectors...")
    norms = np.sqrt(csr.power(2).sum(axis=1)).A1
    inv_norms = np.where(norms > 0, 1.0 / norms, 0.0)
    norm_csr = csr.multiply(inv_norms[:, np.newaxis]).tocsr()
    del csr, norms, inv_norms
    gc.collect()

    # Pre-transpose for fast sparse multiplication
    norm_csr_t = norm_csr.T.tocsr()

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    total_pairs = 0
    sources_with_neighbors = 0
    num_items = len(unique_tmdb)

    print(f"Streaming chunked similarity dot products for {num_items} items (chunk size {chunk_size})...")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("tmdb_id,neighbor_tmdb_id,score\n")

        for start_idx in range(0, num_items, chunk_size):
            end_idx = min(start_idx + chunk_size, num_items)
            chunk_sim = norm_csr[start_idx:end_idx].dot(norm_csr_t)

            indptr = chunk_sim.indptr
            indices_all = chunk_sim.indices
            data_all = chunk_sim.data

            for k in range(end_idx - start_idx):
                i = start_idx + k
                source_tmdb = int(unique_tmdb[i])

                row_start = indptr[k]
                row_end = indptr[k + 1]
                if row_start == row_end:
                    continue

                indices = indices_all[row_start:row_end]
                data = data_all[row_start:row_end]

                # Filter: non-self, score >= min_similarity, score <= 1.0001
                mask = (indices != i) & (data >= min_similarity) & (data <= 1.0001)
                if not np.any(mask):
                    continue

                cand_indices = indices[mask]
                cand_scores = data[mask]
                cand_tmdb_ids = unique_tmdb[cand_indices]

                # Deterministic tie-breaking: score descending, then neighbor tmdbId ascending
                order = np.lexsort((cand_tmdb_ids, -cand_scores))
                top_indices = order[:top_k]

                sources_with_neighbors += 1
                for idx in top_indices:
                    score = float(cand_scores[idx])
                    neighbor_tmdb = int(cand_tmdb_ids[idx])
                    f.write(f"{source_tmdb},{neighbor_tmdb},{score:.4f}\n")
                    total_pairs += 1

            if end_idx % 10000 == 0 or end_idx == num_items:
                print(f"Processed {end_idx}/{num_items} items ({total_pairs} pairs found so far)...")

    return {
        "distinct_source_movies_with_neighbors": sources_with_neighbors,
        "total_neighbor_pairs": total_pairs
    }

def validate_candidate_artifact(csv_path: str):
    if not os.path.isfile(csv_path) or os.path.getsize(csv_path) == 0:
        raise ValueError(f"Candidate artifact {csv_path} is missing or empty")

    with open(csv_path, "r", encoding="utf-8") as f:
        header = f.readline().strip()
        if header != "tmdb_id,neighbor_tmdb_id,score":
            raise ValueError(f"Invalid header in {csv_path}: expected 'tmdb_id,neighbor_tmdb_id,score', got '{header}'")

        seen_pairs = set()
        current_source = None
        source_count = 0
        total_rows = 0

        for line_num, line in enumerate(f, start=2):
            parts = line.strip().split(",")
            if len(parts) != 3:
                raise ValueError(f"Malformed row at line {line_num} in {csv_path}: {line.strip()}")
            try:
                tmdb_id = int(parts[0])
                neighbor_tmdb_id = int(parts[1])
                score = float(parts[2])
            except ValueError as e:
                raise ValueError(f"Non-numeric values at line {line_num} in {csv_path}: {e}")

            if tmdb_id <= 0 or neighbor_tmdb_id <= 0:
                raise ValueError(f"Non-positive TMDB ID at line {line_num}: tmdb_id={tmdb_id}, neighbor={neighbor_tmdb_id}")
            if tmdb_id == neighbor_tmdb_id:
                raise ValueError(f"Self-similarity detected at line {line_num}: tmdb_id={tmdb_id}")
            if score < 0.10 or score > 1.0001:
                raise ValueError(f"Score {score} out of bounds [0.10, 1.00] at line {line_num}")

            pair = (tmdb_id, neighbor_tmdb_id)
            if pair in seen_pairs:
                raise ValueError(f"Duplicate pair detected at line {line_num}: {pair}")
            seen_pairs.add(pair)

            if current_source != tmdb_id:
                current_source = tmdb_id
                source_count = 1
            else:
                source_count += 1
                if source_count > 30:
                    raise ValueError(f"Exceeded max 30 neighbors for source TMDB ID {tmdb_id} at line {line_num}")

            total_rows += 1

        if total_rows == 0:
            raise ValueError(f"Candidate artifact {csv_path} contains 0 data rows (empty)")

def generate_provenance_manifest(
    ratings_path: str,
    links_path: str,
    output_csv_path: str,
    stats: dict,
    sim_stats: dict
) -> dict:
    manifest = {
        "dataset_source": "MovieLens ml-latest",
        "dataset_url": MOVIELENS_URL,
        "dataset_snapshot_date": "2023-07-20",
        "inputs": {
            "ratings_file": os.path.basename(ratings_path),
            "ratings_sha256": sha256_file(ratings_path),
            "links_file": os.path.basename(links_path),
            "links_sha256": sha256_file(links_path),
        },
        "environment": {
            "python_version": sys.version,
            "pandas_version": importlib.metadata.version("pandas"),
            "numpy_version": importlib.metadata.version("numpy"),
            "scipy_version": importlib.metadata.version("scipy"),
            "scikit_learn_version": importlib.metadata.version("scikit-learn"),
        },
        "algorithm": {
            "type": "uncentered item-item cosine similarity over sparse rating vectors",
            "rating_scale": "0.5 to 5.0",
            "top_k_neighbors": 30,
            "min_similarity_threshold": 0.10,
            "tie_breaking": "descending score, then ascending neighbor TMDB ID, ascending source TMDB ID",
            "score_rounding": "4 decimal places after selection",
        },
        "input_statistics": stats,
        "output_statistics": {
            "distinct_source_movies_with_neighbors": sim_stats["distinct_source_movies_with_neighbors"],
            "total_neighbor_pairs": sim_stats["total_neighbor_pairs"],
            "output_sha256": sha256_file(output_csv_path),
        }
    }
    return manifest

def train_and_publish(data_dir: str = DEFAULT_DATA_DIR, output_csv: str = OUTPUT_CSV):
    import time
    import resource
    t_start = time.perf_counter()

    ratings_path, links_path = validate_inputs(data_dir)
    cleaned_df, stats = clean_and_deduplicate(ratings_path, links_path)

    tmp_csv = output_csv + ".tmp"
    sim_stats = compute_item_similarities(cleaned_df, tmp_csv)

    print("Validating candidate artifact...")
    validate_candidate_artifact(tmp_csv)
    print("Candidate artifact validated successfully.")

    t_end = time.perf_counter()
    peak_rss_bytes = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    elapsed_seconds = t_end - t_start

    manifest_data = generate_provenance_manifest(ratings_path, links_path, tmp_csv, stats, sim_stats)
    manifest_data["run_measurements"] = {
        "elapsed_seconds": round(elapsed_seconds, 2),
        "peak_process_memory_bytes": peak_rss_bytes,
        "peak_process_memory_mib": round(peak_rss_bytes / (1024 * 1024), 2),
        "output_csv_size_bytes": os.path.getsize(tmp_csv)
    }

    tmp_manifest = OUTPUT_MANIFEST + ".tmp"
    with open(tmp_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    with open(OUTPUT_ATTRIBUTION, "w", encoding="utf-8") as f:
        f.write(ATTRIBUTION_TEXT)

    os.replace(tmp_csv, output_csv)
    os.replace(tmp_manifest, OUTPUT_MANIFEST)
    print(f"Training and validation finished in {elapsed_seconds:.2f}s.")
    print(f"Peak trainer memory: {peak_rss_bytes / (1024 * 1024):.2f} MiB ({peak_rss_bytes / (1024 * 1024 * 1024):.2f} GiB).")
    print(f"Successfully published {sim_stats['total_neighbor_pairs']} neighbor pairs to {output_csv}")
    print(f"Provenance manifest written to {OUTPUT_MANIFEST}")
    print(f"Attribution written to {OUTPUT_ATTRIBUTION}")

if __name__ == "__main__":
    train_and_publish()
