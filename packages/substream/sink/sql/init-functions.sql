CREATE FUNCTION search_entities(search_term TEXT) 
RETURNS SETOF entities AS $$
  SELECT *
  FROM entities
  WHERE search_vector @@ to_tsquery('english', search_term)
  ORDER BY ts_rank(search_vector, to_tsquery('english', search_term)) DESC;
$$ LANGUAGE SQL STABLE;

CREATE FUNCTION search_entities_fuzzy(search_term TEXT) 
RETURNS SETOF entities AS $$
  SELECT *
  FROM entities
  WHERE search_vector @@ to_tsquery('english', search_term) -- Full-text search
     OR name % search_term                          -- Fuzzy search on name
  ORDER BY 
    ts_rank(search_vector, to_tsquery('english', search_term)) DESC, -- Full-text relevance
    similarity(name, search_term) DESC; -- Fuzzy relevance
$$ LANGUAGE SQL STABLE;