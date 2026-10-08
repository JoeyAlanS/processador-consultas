import unittest

from consulta.executor import equivalent, execute
from consulta.parser import QueryError, parse, validate
from consulta.planner import build_plan, execution_order
from consulta.processor import process_query
from consulta.schema import EXAMPLES, SAMPLE_DATA, SCHEMA


def query(sql):
    return validate(parse(sql))


class ProcessorTests(unittest.TestCase):
    def test_catalog_and_sample_fields(self):
        self.assertEqual(len(SCHEMA), 10)
        for table, columns in SCHEMA.items():
            for row in SAMPLE_DATA[table]:
                self.assertEqual(list(row), columns)
        self.assertIn("Cliente_idCliente", SCHEMA["Endereco"])
        self.assertIn("PrecoUnitario", SCHEMA["Pedido_has_Produto"])

    def test_parser_aliases_groups_and_operators(self):
        parsed = query("select p.Nome from Produto p where (p.Preco >= 200 and (p.Preco <= 1000 AND p.Nome <> 'Fone')); -- fim")
        self.assertEqual(parsed["columns"][0]["key"], "p.Nome")
        self.assertEqual(parsed["where"]["type"], "and")
        self.assertEqual(parsed["tables"][0]["table"], "Produto")
        self.assertGreater(len(parsed["tokens"]), 20)

    def test_known_single_table_result(self):
        result = process_query("SELECT Nome, Preco FROM Produto WHERE Preco > 200 AND QuantEstoque >= 15")
        self.assertEqual(result["optimizedResult"]["rows"], [["Teclado", 249], ["Monitor", 950], ["Caixa de som", 320]])
        self.assertTrue(result["verified"])

    def test_inner_join_result_and_materialization(self):
        result = process_query(EXAMPLES[1]["sql"])
        self.assertCountEqual(result["optimizedResult"]["rows"], [["Notebook", 3500, "Informática"], ["Teclado", 249, "Informática"], ["Monitor", 950, "Informática"]])
        self.assertLess(result["optimizedResult"]["cells"], result["originalResult"]["cells"])

    def test_where_join_is_deferred_to_delivery_four(self):
        result = process_query(EXAMPLES[3]["sql"])
        self.assertIn("cross", [node["type"] for node in result["optimized"]["order"]])
        self.assertEqual(len(result["optimizedResult"]["rows"]), 5)
        self.assertTrue(result["verified"])

    def test_relation_order_is_preserved(self):
        result = process_query(EXAMPLES[2]["sql"])
        scans = [node["alias"] for node in result["optimized"]["order"] if node["type"] == "scan"]
        self.assertEqual(scans, [table["alias"] for table in result["query"]["tables"]])
        self.assertEqual(result["optimizedResult"]["rows"], [["Delta Ltda", 4, 1150, "Pago"]])

    def test_projection_preserves_join_keys(self):
        result = process_query("SELECT p.Nome FROM Produto p, Categoria c WHERE p.Categoria_idCategoria = c.idCategoria AND p.Preco > 100")
        projections = [node for node in result["optimized"]["order"] if node["type"] == "project" and not node["final"]]
        self.assertTrue(any("p.Categoria_idCategoria" in node["columns"] for node in projections))
        self.assertTrue(any("c.idCategoria" in node["columns"] for node in projections))
        self.assertEqual(len(result["optimizedResult"]["rows"]), 5)

    def test_local_filters_keep_textual_order_before_projection(self):
        plan = build_plan(query("SELECT Nome FROM Produto WHERE Preco > 10 AND Categoria_idCategoria = 1"), True)
        order = execution_order(plan["root"])
        self.assertEqual(order[1]["type"], "select")
        self.assertEqual([predicate["operator"] for predicate in order[1]["predicates"]], [">", "="])
        self.assertEqual(order[2]["type"], "project")

    def test_duplicate_and_empty_tuple_multiplicity(self):
        result = process_query("SELECT Categoria_idCategoria FROM Produto")["optimizedResult"]
        self.assertEqual(len(result["rows"]), 8)
        self.assertEqual(result["rows"].count([1]), 4)
        result = process_query("SELECT c.Descricao FROM Categoria c, TipoCliente t")
        self.assertEqual(len(result["optimizedResult"]["rows"]), 6)
        self.assertTrue(any(node["type"] == "project" and not node["columns"] for node in result["optimized"]["order"]))

    def test_star_expansion_and_output_order(self):
        result = process_query("SELECT c.*, p.Nome FROM Categoria c INNER JOIN Produto p ON c.idCategoria = p.Categoria_idCategoria")
        self.assertEqual(result["optimizedResult"]["columns"], ["c.idCategoria", "c.Descricao", "p.Nome"])
        self.assertEqual(len(result["optimizedResult"]["rows"]), 8)
        self.assertEqual(len(process_query("SELECT * FROM Produto")["optimizedResult"]["columns"]), 6)

    def test_duplicate_output_columns(self):
        result = process_query("SELECT Nome, Nome FROM Produto WHERE idProduto = 1")
        self.assertEqual(result["optimizedResult"]["rows"], [["Notebook", "Notebook"]])

    def test_escaped_strings_negative_numbers_and_null(self):
        data = {**SAMPLE_DATA, "Categoria": [{"idCategoria": 1, "Descricao": "D'Ávila"}]}
        result = process_query("SELECT Descricao FROM Categoria WHERE Descricao = 'D''Ávila'", data)
        self.assertEqual(result["optimizedResult"]["rows"], [["D'Ávila"]])
        self.assertEqual(len(process_query("SELECT Nome FROM Produto WHERE Preco > -1.5")["optimizedResult"]["rows"]), 8)
        self.assertEqual(process_query("SELECT Nome FROM Produto WHERE Descricao = NULL")["optimizedResult"]["rows"], [])
        self.assertEqual(len(process_query("SELECT Nome FROM Produto WHERE Descricao <> 'abc'")["optimizedResult"]["rows"]), 7)

    def test_constant_predicates_and_same_column(self):
        for predicate in ("1 = 0", "Preco > Preco"):
            self.assertEqual(process_query(f"SELECT Nome FROM Produto WHERE {predicate}")["optimizedResult"]["rows"], [])
        self.assertEqual(len(process_query("SELECT Nome FROM Produto WHERE 'AND' = 'AND'")["optimizedResult"]["rows"]), 8)

    def test_self_join_and_inequality(self):
        result = process_query("SELECT a.Nome, b.Nome FROM Produto a INNER JOIN Produto b ON a.Categoria_idCategoria = b.Categoria_idCategoria WHERE a.idProduto < b.idProduto")
        self.assertEqual(len(result["optimizedResult"]["rows"]), 8)
        self.assertTrue(result["verified"])

    def test_disconnected_graph_keeps_required_cross_product(self):
        result = process_query("SELECT c.Nome, s.Descricao FROM Cliente c, Status s")
        self.assertEqual(len(result["optimizedResult"]["rows"]), 12)
        self.assertIn("cross", [node["type"] for node in result["optimized"]["order"]])
        self.assertTrue(any("necessário" in note for note in result["optimized"]["notes"]))

    def test_all_comparison_operators(self):
        for operator, count in [("=", 1), ("<>", 7), (">", 4), ("<", 3), (">=", 5), ("<=", 4)]:
            with self.subTest(operator=operator):
                self.assertEqual(len(process_query(f"SELECT idProduto FROM Produto WHERE idProduto {operator} 4")["optimizedResult"]["rows"]), count)

    def test_invalid_tables_fields_aliases_and_scopes(self):
        cases = [
            ("SELECT Nome FROM Fantasma", "Tabela inexistente"),
            ("SELECT Valor FROM Produto", "Campo inexistente"),
            ("SELECT Nome FROM Produto p, Cliente c", "ambíguo"),
            ("SELECT p.Nome FROM Produto p, Categoria p", "Alias repetido"),
            ("SELECT Produto.Nome FROM Produto p", "fora do escopo"),
            ("SELECT z.* FROM Produto p", "alias inexistente"),
            ("SELECT p.Nome FROM Produto p INNER JOIN Categoria c ON z.idStatus = c.idCategoria INNER JOIN Status z ON z.idStatus = c.idCategoria", "fora do escopo"),
        ]
        for sql, message in cases:
            with self.subTest(sql=sql), self.assertRaisesRegex(QueryError, message):
                query(sql)

    def test_rejects_unsupported_syntax_with_position(self):
        cases = ["", "DELETE FROM Produto", "SELECT Nome FROM Produto; DROP TABLE Produto", "SELECT Nome FROM Produto WHERE Preco != 1", "SELECT Nome FROM Produto WHERE Preco > 1 OR Preco < 2", "SELECT Nome FROM Produto WHERE (Preco > 1", "SELECT Nome FROM Produto WHERE Nome = 'ab", "SELECT SUM(Preco) FROM Produto", "SELECT Nome FROM Produto ORDER BY Nome", "SELECT Nome FROM Produto INNER JOIN Categoria", "SELECT Nome, FROM Produto", "SELECT Nome FROM Produto WHERE Preco > 1 AND", "SELECT Nome FROM Produto LIMIT 1"]
        for sql in cases:
            with self.subTest(sql=sql), self.assertRaises(QueryError) as caught:
                query(sql)
            self.assertIsInstance(caught.exception.position, int)

    def test_postorder_dependencies_and_server_labels(self):
        plan = process_query(EXAMPLES[2]["sql"])["optimized"]
        order = plan["order"]
        positions = {node["id"]: index for index, node in enumerate(order)}
        self.assertEqual(len(positions), len(order))
        for step, node in enumerate(order, 1):
            self.assertEqual(node["step"], step)
            self.assertIn("label", node)
            for child in node["children"]:
                self.assertLess(positions[child["id"]], positions[node["id"]])
        self.assertTrue(order[-1]["final"])

    def test_intermediate_execution_limits(self):
        plan = build_plan(query("SELECT * FROM Produto p, Produto q"))
        with self.assertRaisesRegex(QueryError, "Resultado intermediário"):
            execute(plan, max_rows=10)
        with self.assertRaisesRegex(QueryError, "limite didático"):
            execute(plan, max_work=10)

    def test_incompatible_types_are_explicit(self):
        with self.assertRaisesRegex(QueryError, "tipos incompatíveis"):
            process_query("SELECT Nome FROM Produto WHERE Preco > '10'")

    def test_original_errors_are_not_resource_limits(self):
        with self.assertRaisesRegex(QueryError, "tipos incompatíveis"):
            process_query("SELECT Nome FROM Produto WHERE Preco > '10' AND idProduto = 999")

    def test_original_limit_does_not_discard_optimized_result(self):
        data = {**SAMPLE_DATA, "Produto": [{**SAMPLE_DATA["Produto"][0], "idProduto": index + 1} for index in range(300)]}
        result = process_query("SELECT p.Nome FROM Produto p, Produto q WHERE p.idProduto = q.idProduto AND p.idProduto = 1 AND q.idProduto = 1", data)
        self.assertFalse(result["verified"])
        self.assertIn("Resultado intermediário", result["originalError"])
        self.assertEqual(result["optimizedResult"]["rows"], [["Notebook"]])

    def test_equivalence_preserves_multiplicity(self):
        self.assertTrue(equivalent({"columns": ["a"], "rows": [[1], [2], [1]]}, {"columns": ["a"], "rows": [[1], [1], [2]]}))
        self.assertFalse(equivalent({"columns": ["a"], "rows": [[1], [1]]}, {"columns": ["a"], "rows": [[1]]}))

    def test_100_queries_match_independent_reference(self):
        for index in range(100):
            price, category = index % 10 * 100, index % 3 + 1
            operator = ">" if index % 2 else "<="
            syntax = "INNER JOIN Categoria c ON p.Categoria_idCategoria = c.idCategoria WHERE" if index % 4 else ", Categoria c WHERE p.Categoria_idCategoria = c.idCategoria AND"
            sql = f"SELECT p.Nome, c.Descricao FROM Produto p {syntax} p.Preco {operator} {price} AND c.idCategoria = {category}"
            result = process_query(sql)
            description = next(row["Descricao"] for row in SAMPLE_DATA["Categoria"] if row["idCategoria"] == category)
            expected = [[row["Nome"], description] for row in SAMPLE_DATA["Produto"] if row["Categoria_idCategoria"] == category and (row["Preco"] > price if operator == ">" else row["Preco"] <= price)]
            with self.subTest(sql=sql):
                self.assertCountEqual(result["optimizedResult"]["rows"], expected)
                self.assertTrue(result["verified"])

    def test_numeric_int_and_float_share_sql_number_type(self):
        self.assertEqual(process_query("SELECT Nome FROM Produto WHERE Preco = 249.0")["optimizedResult"]["rows"], [["Teclado"]])
        self.assertEqual(process_query("SELECT Nome FROM Produto WHERE Preco > .5 AND idProduto = 2")["optimizedResult"]["rows"], [["Mouse"]])

    def test_depth_and_query_length_limits(self):
        with self.assertRaisesRegex(QueryError, "parênteses"):
            parse("SELECT Nome FROM Produto WHERE " + "(" * 101 + "1 = 1" + ")" * 101)
        with self.assertRaisesRegex(QueryError, "20.000"):
            parse(" " * 20001)


if __name__ == "__main__":
    unittest.main()
