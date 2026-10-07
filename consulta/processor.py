"""Pipeline completo da consulta, executado exclusivamente em Python."""

from .executor import equivalent, execute
from .parser import QueryError, comparisons, parse, predicate_text, validate
from .planner import build_plan, relational_algebra


def process_query(sql, data=None):
    query = validate(parse(sql))
    original = build_plan(query, False, data)
    optimized = build_plan(query, True, data)
    optimized_result = execute(optimized, data)
    original_result = None
    original_error = None
    try:
        original_result = execute(original, data)
    except QueryError as error:
        if error.code != "resource":
            raise
        original_error = str(error)
    if original_result is not None and not equivalent(original_result, optimized_result):
        raise RuntimeError("Os planos produziram resultados diferentes. Verifique a implementação do otimizador.")
    predicates = [predicate for join in query["joins"] for predicate in comparisons(join["condition"])] + comparisons(query["where"])
    query["predicateLabels"] = [predicate_text(predicate) for predicate in predicates]
    return {
        "query": query, "original": original, "optimized": optimized,
        "originalResult": original_result, "optimizedResult": optimized_result,
        "originalError": original_error, "verified": original_result is not None,
        "algebra": {"original": relational_algebra(original["root"]), "optimized": relational_algebra(optimized["root"])},
        "backend": "Python",
    }
