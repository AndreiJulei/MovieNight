import os
import sys
import tempfile
import pytest
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from train_similarity import (
    validate_inputs,
    clean_and_deduplicate,
    compute_item_similarities,
    validate_candidate_artifact,
    generate_provenance_manifest,
    ATTRIBUTION_TEXT
)

def test_validate_inputs_both_present(tmp_path):
    ratings = tmp_path / "ratings.csv"
    links = tmp_path / "links.csv"
    ratings.write_text("userId,movieId,rating,timestamp\n1,10,4.0,100\n")
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n")

    r_path, l_path = validate_inputs(str(tmp_path))
    assert r_path == str(ratings)
    assert l_path == str(links)

def test_validate_inputs_incomplete_ratings_only(tmp_path):
    ratings = tmp_path / "ratings.csv"
    ratings.write_text("userId,movieId,rating,timestamp\n1,10,4.0,100\n")

    with pytest.raises(ValueError, match="Incomplete input"):
        validate_inputs(str(tmp_path))

def test_validate_inputs_incomplete_links_only(tmp_path):
    links = tmp_path / "links.csv"
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n")

    with pytest.raises(ValueError, match="Incomplete input"):
        validate_inputs(str(tmp_path))

def test_clean_and_deduplicate_mapping_consistency(tmp_path):
    # Same movieId mapped to two different TMDB IDs is an error
    ratings = tmp_path / "ratings.csv"
    links = tmp_path / "links.csv"
    ratings.write_text("userId,movieId,rating,timestamp\n1,10,4.0,100\n")
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n10,123,2000\n")

    with pytest.raises(ValueError, match="Inconsistent TMDB mapping"):
        clean_and_deduplicate(str(ratings), str(links))

def test_clean_and_deduplicate_tie_breaking(tmp_path):
    ratings = tmp_path / "ratings.csv"
    links = tmp_path / "links.csv"
    # movieId 10 -> tmdb 1000, movieId 20 -> tmdb 1000 (alias)
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n20,124,1000\n30,125,2000\n")
    
    # User 1 rates TMDB 1000 at timestamp 100 (movieId 10, rating 3.0) and timestamp 200 (movieId 20, rating 4.5)
    # Latest timestamp (200) should win -> rating 4.5
    # User 2 rates TMDB 1000 tied at timestamp 300 with movieId 20 (rating 4.0) and movieId 10 (rating 5.0)
    # Smallest movieId (10) breaks timestamp tie -> rating 5.0
    ratings_content = (
        "userId,movieId,rating,timestamp\n"
        "1,10,3.0,100\n"
        "1,20,4.5,200\n"
        "2,20,4.0,300\n"
        "2,10,5.0,300\n"
        "3,30,4.0,150\n"
    )
    ratings.write_text(ratings_content)

    cleaned, stats = clean_and_deduplicate(str(ratings), str(links))
    assert len(cleaned) == 3
    u1_row = cleaned[(cleaned['userId'] == 1) & (cleaned['tmdbId'] == 1000)].iloc[0]
    assert u1_row['rating'] == 4.5

    u2_row = cleaned[(cleaned['userId'] == 2) & (cleaned['tmdbId'] == 1000)].iloc[0]
    assert u2_row['rating'] == 5.0

def test_clean_and_deduplicate_identical_duplicate_collapsed(tmp_path):
    ratings = tmp_path / "ratings.csv"
    links = tmp_path / "links.csv"
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n")
    # Exact duplicate row
    ratings.write_text(
        "userId,movieId,rating,timestamp\n"
        "1,10,4.0,100\n"
        "1,10,4.0,100\n"
    )
    cleaned, stats = clean_and_deduplicate(str(ratings), str(links))
    assert len(cleaned) == 1
    assert cleaned.iloc[0]['rating'] == 4.0

def test_clean_and_deduplicate_conflicting_tie_rejected(tmp_path):
    ratings = tmp_path / "ratings.csv"
    links = tmp_path / "links.csv"
    links.write_text("movieId,imdbId,tmdbId\n10,123,1000\n")
    # Same userId, tmdbId, timestamp, movieId, but DIFFERENT rating values
    ratings.write_text(
        "userId,movieId,rating,timestamp\n"
        "1,10,4.0,100\n"
        "1,10,5.0,100\n"
    )
    with pytest.raises(ValueError, match="Conflicting rating records"):
        clean_and_deduplicate(str(ratings), str(links))

def test_raw_cosine_similarity_calculation(tmp_path):
    # Movie 100: User 1=4.0, User 2=3.0 -> norm = sqrt(16+9) = 5.0 -> [4/5, 3/5] = [0.8, 0.6]
    # Movie 200: User 1=2.0, User 2=4.0 -> norm = sqrt(4+16) = sqrt(20) = 4.472136 -> [2/sqrt(20), 4/sqrt(20)]
    # Dot product: (4*2 + 3*4) / (5.0 * sqrt(20)) = 20 / 22.36067977 = 0.89442719
    df = pd.DataFrame([
        {"userId": 1, "tmdbId": 100, "rating": 4.0},
        {"userId": 2, "tmdbId": 100, "rating": 3.0},
        {"userId": 1, "tmdbId": 200, "rating": 2.0},
        {"userId": 2, "tmdbId": 200, "rating": 4.0},
        {"userId": 3, "tmdbId": 300, "rating": 5.0}, # orthogonal to 100 and 200
    ])
    out_csv = tmp_path / "output.csv"
    compute_item_similarities(df, str(out_csv), chunk_size=10, min_similarity=0.10, top_k=30)

    res = pd.read_csv(out_csv)
    assert len(res) == 2 # 100->200 and 200->100
    row = res[(res['tmdb_id'] == 100) & (res['neighbor_tmdb_id'] == 200)].iloc[0]
    assert row['score'] == 0.8944

def test_top_k_and_min_similarity_filter(tmp_path):
    # Create movie with multiple neighbors, some below 0.10
    # Movie 1 rated by user 1=1.0, user 2=10.0 (norm ~ 10.05)
    # Movie 2 rated by user 1=1.0, user 3=100.0 (norm ~ 100.0) -> dot product = 1.0 / (10.05 * 100) = ~0.00099 < 0.10
    df = pd.DataFrame([
        {"userId": 1, "tmdbId": 10, "rating": 1.0},
        {"userId": 2, "tmdbId": 10, "rating": 5.0},
        {"userId": 1, "tmdbId": 20, "rating": 1.0},
        {"userId": 3, "tmdbId": 20, "rating": 5.0}, # dot with 10: 1.0 / (sqrt(26)*sqrt(26)) = 1/26 = 0.0384 < 0.10
        {"userId": 1, "tmdbId": 30, "rating": 4.0},
        {"userId": 2, "tmdbId": 30, "rating": 5.0}, # dot with 10: (4+25) / (sqrt(26)*sqrt(41)) = 29/32.65 = 0.888 > 0.10
    ])
    out_csv = tmp_path / "output.csv"
    compute_item_similarities(df, str(out_csv), chunk_size=10, min_similarity=0.10, top_k=30)
    res = pd.read_csv(out_csv)
    # Movie 20 has similarity < 0.10 with 10, so pair (10, 20) should not appear
    assert not any((res['tmdb_id'] == 10) & (res['neighbor_tmdb_id'] == 20))
    assert any((res['tmdb_id'] == 10) & (res['neighbor_tmdb_id'] == 30))

def test_tie_breaking_order(tmp_path):
    # Movie 10 has identical similarity to Movie 20 and Movie 15
    # Order should be descending score, then ascending neighbor TMDB ID (so 15 before 20)
    df = pd.DataFrame([
        {"userId": 1, "tmdbId": 10, "rating": 4.0},
        {"userId": 1, "tmdbId": 20, "rating": 4.0},
        {"userId": 1, "tmdbId": 15, "rating": 4.0},
    ])
    out_csv = tmp_path / "output.csv"
    compute_item_similarities(df, str(out_csv), chunk_size=10, min_similarity=0.10, top_k=30)
    res = pd.read_csv(out_csv)
    m10_neighbors = res[res['tmdb_id'] == 10]['neighbor_tmdb_id'].tolist()
    assert m10_neighbors == [15, 20]

def test_input_encounter_order_invariance(tmp_path):
    # Reverse input rows, output CSV must be byte-for-byte identical
    df1 = pd.DataFrame([
        {"userId": 1, "tmdbId": 10, "rating": 4.0},
        {"userId": 2, "tmdbId": 10, "rating": 3.0},
        {"userId": 1, "tmdbId": 20, "rating": 4.0},
        {"userId": 2, "tmdbId": 20, "rating": 3.0},
        {"userId": 1, "tmdbId": 30, "rating": 5.0},
    ])
    df2 = df1.sample(frac=1.0, random_state=42).reset_index(drop=True)

    out1 = tmp_path / "out1.csv"
    out2 = tmp_path / "out2.csv"
    compute_item_similarities(df1, str(out1), chunk_size=10, min_similarity=0.10, top_k=30)
    compute_item_similarities(df2, str(out2), chunk_size=10, min_similarity=0.10, top_k=30)

    assert out1.read_bytes() == out2.read_bytes()

def test_validate_candidate_artifact_valid(tmp_path):
    csv_file = tmp_path / "valid.csv"
    csv_file.write_text("tmdb_id,neighbor_tmdb_id,score\n10,20,0.8500\n10,30,0.4200\n20,10,0.8500\n")
    validate_candidate_artifact(str(csv_file)) # should not raise

def test_validate_candidate_artifact_empty(tmp_path):
    csv_file = tmp_path / "empty.csv"
    csv_file.write_text("tmdb_id,neighbor_tmdb_id,score\n")
    with pytest.raises(ValueError, match="empty"):
        validate_candidate_artifact(str(csv_file))

def test_validate_candidate_artifact_self_similarity(tmp_path):
    csv_file = tmp_path / "self.csv"
    csv_file.write_text("tmdb_id,neighbor_tmdb_id,score\n10,10,1.0000\n")
    with pytest.raises(ValueError, match="Self-similarity"):
        validate_candidate_artifact(str(csv_file))

def test_validate_candidate_artifact_duplicate_pair(tmp_path):
    csv_file = tmp_path / "dup.csv"
    csv_file.write_text("tmdb_id,neighbor_tmdb_id,score\n10,20,0.8500\n10,20,0.8500\n")
    with pytest.raises(ValueError, match="Duplicate pair"):
        validate_candidate_artifact(str(csv_file))
