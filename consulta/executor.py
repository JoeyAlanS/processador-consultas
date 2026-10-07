"""Execução dos operadores sobre multiconjuntos de registros em memória."""

from collections import Counter
import operator

from .parser import QueryError
from .planner import execution_order
from .schema import SAMPLE_DATA

OPERATORS = {"=": operator.eq, "<>": operator.ne, ">": operator.gt, "<": operator.lt, ">=": operator.ge, "<=": operator.le}


def evaluate(predicate, row):
    def value(operand):
        return row[operand["key"]] if operand["type"] == "column" else operand["value"]

    left, right = value(predicate["left"]), value(predicate["right"])
    if left is None or right is None:
        return False  # SQL UNKNOWN não satisfaz uma seleção.
    numeric = lambda item: isinstance(item, (int, float)) and not isinstance(item, bool)
    if type(left) is not type(right) and not (numeric(left) and numeric(right)):
        raise QueryError("Comparação entre tipos incompatíveis. Use números sem aspas e textos com aspas simples.", predicate["position"])
    return OPERATORS[predicate["operator"]](left, right)


def execute(plan, data=None, *, max_rows=50000, max_work=500000):
    if data is None:
        data = SAMPLE_DATA
    trace = []
    work = 0
    cells = 0
    materialized = {}

    def tick(amount=1):
        nonlocal work
        work += amount
        if work > max_work:
            raise QueryError(f"A consulta ultrapassou o limite didático de {max_work} operações. Reduza as tabelas ou adicione filtros.", 0, "resource")

    for node in execution_order(plan["root"]):
        inputs = [materialized[child["id"]] for child in node["children"]]
        kind = node["type"]
        if kind == "scan":
            tick(len(data[node["table"]]))
            rows = [{f"{node['alias']}.{key}": value for key, value in record.items()} for record in data[node["table"]]]
        elif kind == "select":
            rows = []
            for row in inputs[0]:
                tick()
                if all(evaluate(predicate, row) for predicate in node["predicates"]):
                    rows.append(row)
        elif kind == "project":
            rows = []
            for row in inputs[0]:
                tick()
                # Não elimina duplicatas, inclusive nas projeções de tupla vazia.
                rows.append({key: row[key] for key in node["columns"]})
        else:
            rows = []
            for left in inputs[0]:
                for right in inputs[1]:
                    tick()
                    row = {**left, **right}
                    if kind == "cross" or all(evaluate(predicate, row) for predicate in node["predicates"]):
                        rows.append(row)
                        if len(rows) > max_rows:
                            raise QueryError(f"Resultado intermediário excedeu {max_rows} tuplas. Reduza a consulta.", 0, "resource")
        if len(rows) > max_rows:
            raise QueryError("Limite de tuplas excedido.", 0, "resource")
        width = len(set(node["columns"]))
        cells += len(rows) * width
        trace.append({"nodeId": node["id"], "type": kind, "inputRows": [len(records) for records in inputs], "rows": len(rows), "width": width, "estimatedRows": node["estimatedRows"]})
        materialized[node["id"]] = rows
        for child in node["children"]:
            del materialized[child["id"]]
    columns = plan["root"]["columns"]
    rows = [[record[key] for key in columns] for record in materialized[plan["root"]["id"]]]
    return {"columns": columns, "rows": rows, "trace": trace, "work": work, "cells": cells}


def equivalent(left, right):
    """A ordem não interfere; a multiplicidade de cada tupla deve coincidir."""
    return left["columns"] == right["columns"] and Counter(map(tuple, left["rows"])) == Counter(map(tuple, right["rows"]))
