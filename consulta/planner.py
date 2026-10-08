"""Entrega 2: grafo original e sua representação em álgebra relacional."""

import math

from .parser import comparisons, predicate_text
from .schema import SAMPLE_DATA, SCHEMA

SYMBOLS = {"scan": "R", "select": "σ", "project": "π", "join": "⋈", "cross": "×"}
NAMES = {"scan": "Leitura", "select": "Seleção", "project": "Projeção", "join": "Junção", "cross": "Produto cartesiano"}


def factor(predicate):
    return 0.1 if predicate["operator"] == "=" else 0.9 if predicate["operator"] == "<>" else 0.33


def restriction(predicates):
    return math.prod(factor(predicate) for predicate in predicates)


def format_estimate(value):
    return f"{value:,.2f}".rstrip("0").rstrip(".").replace(",", "_").replace(".", ",").replace("_", ".")


def node_label(node):
    if node["type"] == "scan":
        return node["table"] + (" AS " + node["alias"] if node["alias"] != node["table"] else "")
    if node["type"] == "project":
        return ", ".join(node["columns"]) or "∅ (preserva multiplicidade)"
    return " AND ".join(predicate_text(predicate) for predicate in node["predicates"]) or "Todas as combinações"


def execution_order(root):
    """Percurso iterativo em pós-ordem: cada dependência precede seu pai."""
    order = []
    stack = [(root, False)]
    while stack:
        node, visited = stack.pop()
        if visited:
            order.append(node)
        else:
            stack.append((node, True))
            stack.extend((child, False) for child in reversed(node["children"]))
    return order


def relational_algebra(root):
    expressions = {}
    for node in execution_order(root):
        kind = node["type"]
        children = [expressions[child["id"]] for child in node["children"]]
        if kind == "scan":
            expression = node["table"] if node["alias"] == node["table"] else f"ρ[{node['alias']}]({node['table']})"
        elif kind in ("select", "project"):
            expression = f"{SYMBOLS[kind]}[{node_label(node)}]({children[0]})"
        else:
            predicate = "[" + node_label(node) + "]" if kind == "join" else ""
            expression = f"({children[0]} {SYMBOLS[kind]}{predicate} {children[1]})"
        expressions[node["id"]] = expression
    return expressions[root["id"]]


def build_plan(query, data=None):
    if data is None:
        data = SAMPLE_DATA
    next_id = 0
    notes = []

    def node(kind, children=None, **fields):
        nonlocal next_id
        next_id += 1
        return {"id": f"n{next_id}", "type": kind, "children": children or [], **fields}

    def scan(table):
        return node("scan", table=table["table"], alias=table["alias"], estimatedRows=len(data[table["table"]]), columns=[f"{table['alias']}.{column}" for column in SCHEMA[table["table"]]])

    def select(child, predicates):
        return node("select", [child], predicates=predicates, columns=child["columns"], estimatedRows=child["estimatedRows"] * restriction(predicates))

    def project(child, columns, final=False):
        return node("project", [child], columns=columns, final=final, estimatedRows=child["estimatedRows"])

    def combine(left, right, predicates=None):
        predicates = predicates or []
        return node("join" if predicates else "cross", [left, right], predicates=predicates, columns=left["columns"] + right["columns"], estimatedRows=left["estimatedRows"] * right["estimatedRows"] * restriction(predicates))

    root = scan(query["tables"][0])
    for index, table in enumerate(query["tables"][1:]):
        root = combine(root, scan(table), comparisons(query["joins"][index]["condition"]))
    if query["where"]:
        root = select(root, comparisons(query["where"]))
    root = project(root, [column["key"] for column in query["columns"]], True)
    notes = ["As tabelas seguem a ordem da consulta.", "Filtros do WHERE são aplicados após a combinação das relações.", "A projeção final mantém os campos solicitados."]
    order = execution_order(root)
    for step, operator in enumerate(order, 1):
        operator.update(label=node_label(operator), symbol=SYMBOLS[operator["type"]], name=NAMES[operator["type"]], step=step, width=len(set(operator["columns"])))
    # Envia ordem e rótulos prontos; JavaScript apenas apresenta os operadores.
    return {"root": root, "optimized": False, "notes": notes, "order": order}
