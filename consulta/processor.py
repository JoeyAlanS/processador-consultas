"""Entrega 2: acrescenta álgebra relacional e grafo não otimizado."""

from .parser import comparisons, parse, predicate_text, validate
from .planner import build_plan, relational_algebra


def process_query(sql, data=None):
    query = validate(parse(sql))
    original = build_plan(query, data)
    predicates = [predicate for join in query["joins"] for predicate in comparisons(join["condition"])] + comparisons(query["where"])
    query["predicateLabels"] = [predicate_text(predicate) for predicate in predicates]
    return {
        "query": query,
        "original": original,
        "algebra": {"original": relational_algebra(original["root"])},
        "backend": "Python",
    }
