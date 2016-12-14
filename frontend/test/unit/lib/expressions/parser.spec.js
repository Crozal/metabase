import { compile, suggest, parse } from "metabase/lib/expressions/parser";
import _ from "underscore";

const mockMetadata = {
    tableMetadata: {
        fields: [
            {id: 1, display_name: "A"},
            {id: 2, display_name: "B"},
            {id: 3, display_name: "C"},
            {id: 10, display_name: "Toucan Sam"}
        ],
        metrics: [
            {id: 1, name: "foo bar"},
        ],
        aggregation_options: [
            { short: "count", fields: [] },
            { short: "sum", fields: [[]] }
        ]
    }
}

const expressionOpts = { ...mockMetadata, startRule: "expression" };
const aggregationOpts = { ...mockMetadata, startRule: "aggregation" };

describe("lib/expressions/parser", () => {
    describe("compile()", () => {
        it("should return empty array for null or empty string", () => {
            expect(compile()).toEqual([]);
            expect(compile(null)).toEqual([]);
            expect(compile("")).toEqual([]);
        });

        it("can parse simple expressions", () => {
            expect(compile("A", expressionOpts)).toEqual(['field-id', 1]);
            expect(compile("1", expressionOpts)).toEqual(1);
            expect(compile("1.1", expressionOpts)).toEqual(1.1);
        });

        it("can parse single operator math", () => {
            expect(compile("A-B", expressionOpts)).toEqual(["-", ['field-id', 1], ['field-id', 2]]);
            expect(compile("A - B", expressionOpts)).toEqual(["-", ['field-id', 1], ['field-id', 2]]);
            expect(compile("1 - B", expressionOpts)).toEqual(["-", 1, ['field-id', 2]]);
            expect(compile("1 - 2", expressionOpts)).toEqual(["-", 1, 2]);
        });

        it("can handle operator precedence", () => {
            expect(compile("1 + 2 * 3", expressionOpts)).toEqual(["+", 1, ["*", 2, 3]]);
            expect(compile("1 * 2 + 3", expressionOpts)).toEqual(["+", ["*", 1, 2], 3]);
        });

        it("can collapse consecutive identical operators", () => {
            expect(compile("1 + 2 + 3 * 4 * 5", expressionOpts)).toEqual(["+", 1, 2, ["*", 3, 4, 5]]);
        });

        // quoted field name w/ a space in it
        it("can parse a field with quotes and spaces", () => {
            expect(compile("\"Toucan Sam\" + B", expressionOpts)).toEqual(["+", ['field-id', 10], ['field-id', 2]]);
        });

        // parentheses / nested parens
        it("can parse expressions with parentheses", () => {
            expect(compile("(1 + 2) * 3", expressionOpts)).toEqual(["*", ["+", 1, 2], 3]);
            expect(compile("1 * (2 + 3)", expressionOpts)).toEqual(["*", 1, ["+", 2, 3]]);
            expect(compile("\"Toucan Sam\" + (A * (B / C))", expressionOpts)).toEqual(
                ["+", ['field-id', 10], ["*", [ 'field-id', 1 ], ["/", [ 'field-id', 2 ], [ 'field-id', 3 ]]]]
            );
        });

        it("can parse aggregation with no arguments", () => {
            expect(compile("Count", aggregationOpts)).toEqual(["count"]);
            expect(compile("Count()", aggregationOpts)).toEqual(["count"]);
        });

        it("can parse aggregation with argument", () => {
            expect(compile("Sum(A)", aggregationOpts)).toEqual(["sum", ["field-id", 1]]);
        });

        it("can parse complex aggregation", () => {
            expect(compile("1 - Sum(A * 2) / Count", aggregationOpts)).toEqual(["-", 1, ["/", ["sum", ["*", ["field-id", 1], 2]], ["count"]]]);
        });

        it("should throw exception on invalid input", () => {
            expect(() => compile("1 + ", expressionOpts)).toThrow();
        });

        // fks
        // multiple tables with the same field name resolution
    });

    describe("suggest()", () => {
        it("should suggest aggregations and metrics after an operator", () => {
            expect(cleanSuggestions(suggest("1 + ", aggregationOpts))).toEqual([
                { type: 'aggregations', text: 'Count ' },
                { type: 'aggregations', text: 'Sum(' },
                { type: 'metrics',     text: '"foo bar"' },
                { type: 'other',       text: ' (' },
            ]);
        })
        it("should suggest fields after an operator", () => {
            expect(cleanSuggestions(suggest("1 + ", expressionOpts))).toEqual([
                { type: 'fields',      text: '"Toucan Sam" ' },
                { type: 'fields',      text: 'A ' },
                { type: 'fields',      text: 'B ' },
                { type: 'fields',      text: 'C ' },
                { type: 'other',       text: ' (' },
            ]);
        })
        it("should suggest partial matches in aggregation", () => {
            expect(cleanSuggestions(suggest("1 + C", aggregationOpts))).toEqual([
                { type: 'aggregations', text: 'Count ' },
            ]);
        })
        it("should suggest partial matches in expression", () => {
            expect(cleanSuggestions(suggest("1 + C", expressionOpts))).toEqual([
                { type: 'fields', text: 'C ' },
            ]);
        })
    })

    describe("compile() in syntax mode", () => {
        it ("should parse source without whitespace into a recoverable syntax tree", () => {
            const source = "1-Sum(A*2+\"Toucan Sam\")/Count()+\"foo bar\"";
            const tree = parse(source, aggregationOpts);
            expect(serialize(tree)).toEqual(source)
        })
        xit ("should parse source with whitespace into a recoverable syntax tree", () => {
            // FIXME: not preserving whitespace
            const source = "1 - Sum(A * 2 + \"Toucan Sam\") / Count + \"foo bar\"";
            const tree = parse(source, aggregationOpts);
            expect(serialize(tree)).toEqual(source)
        })
    })
});

function serialize(tree) {
    if (tree.type === "token") {
        return tree.text;
    } else {
        return tree.children.map(serialize).join("");
    }
}

function cleanSuggestions(suggestions) {
    return _.chain(suggestions).map(s => _.pick(s, "type", "text")).sortBy("text").sortBy("type").value();
}
