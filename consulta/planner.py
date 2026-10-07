"""Construção dos grafos, álgebra relacional e otimização heurística."""

import math

from .parser import aliases, comparisons, predicate_text, references
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


def build_plan(query, optimized=False, data=None):
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

    if not optimized:
        root = scan(query["tables"][0])
        for index, table in enumerate(query["tables"][1:]):
            root = combine(root, scan(table), comparisons(query["joins"][index]["condition"]))
        if query["where"]:
            root = select(root, comparisons(query["where"]))
        root = project(root, [column["key"] for column in query["columns"]], True)
        notes = ["As tabelas seguem a ordem da consulta.", "Filtros do WHERE são aplicados após a combinação das relações.", "A projeção final mantém os campos solicitados."]
    else:
        predicates = [predicate for join in query["joins"] for predicate in comparisons(join["condition"])] + comparisons(query["where"])
        multi = [predicate for predicate in predicates if len(aliases(predicate)) > 1]
        constants = [predicate for predicate in predicates if not aliases(predicate)]
        required = {column["key"] for column in query["columns"]} | {column["key"] for predicate in multi for column in references(predicate)}
        branches = []
        for position, table in enumerate(query["tables"]):
            branch = scan(table)
            filters = sorted((predicate for predicate in predicates if aliases(predicate) == [table["alias"]]), key=factor)
            # Nós separados tornam a ordem dos filtros mais restritivos visível.
            for predicate in filters:
                branch = select(branch, [predicate])
            if filters:
                notes.append(f"Seleção antecipada em {table['alias']}: {' AND '.join(map(predicate_text, filters))}. Predicados ordenados pela seletividade estimada.")
            kept = [column for column in branch["columns"] if column in required]
            if len(kept) < len(branch["columns"]):
                notes.append(f"Projeção antecipada em {table['alias']}: {len(branch['columns'])} → {len(kept)} atributos; mantém campos de saída e de junção.")
                branch = project(branch, kept)
            branches.append({"alias": table["alias"], "position": position, "node": branch})
        branches.sort(key=lambda branch: (branch["node"]["estimatedRows"], branch["position"]))
        first = branches.pop(0)
        root = first["node"]
        joined = {first["alias"]}
        notes.append(f"Início pela relação {first['alias']}, com menor cardinalidade estimada após os filtros ({format_estimate(root['estimatedRows'])} tuplas).")
        pending = list(multi)
        while branches:
            candidates = []
            for branch in branches:
                scope = joined | {branch["alias"]}
                ready = [predicate for predicate in pending if set(aliases(predicate)) <= scope]
                estimate = root["estimatedRows"] * branch["node"]["estimatedRows"] * restriction(ready)
                candidates.append({"branch": branch, "predicates": ready, "estimate": estimate})
            chosen = min(candidates, key=lambda item: (not bool(item["predicates"]), item["estimate"], item["branch"]["position"]))
            branch = chosen["branch"]
            root = combine(root, branch["node"], chosen["predicates"])
            applied = {id(predicate) for predicate in chosen["predicates"]}
            pending = [predicate for predicate in pending if id(predicate) not in applied]
            joined.add(branch["alias"])
            branches.remove(branch)
            if chosen["predicates"]:
                notes.append(f"Junção com {branch['alias']}: {' AND '.join(map(predicate_text, chosen['predicates']))}. Prioriza ligação entre tabelas e menor resultado estimado.")
            else:
                notes.append(f"Produto cartesiano necessário com {branch['alias']}: não há predicado ligando essa relação às já processadas.")
        if constants:
            root = select(root, constants)
        root = project(root, [column["key"] for column in query["columns"]], True)
    order = execution_order(root)
    for step, operator in enumerate(order, 1):
        operator.update(label=node_label(operator), symbol=SYMBOLS[operator["type"]], name=NAMES[operator["type"]], step=step, width=len(set(operator["columns"])))
    # Envia ordem e rótulos prontos; JavaScript apenas apresenta os operadores.
    return {"root": root, "optimized": optimized, "notes": notes, "order": order}
