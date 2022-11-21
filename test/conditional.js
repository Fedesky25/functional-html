const test = require("ava").default;
const { render } = require("posthtml-render");
const { Builder } = require("../dist/index.js");

const builder = new Builder("test/conditional");

test("conditional: basics", async i => {
    const { ast } = await builder.componentify("basic.html");
    i.is(render(ast({type: 0}, {})), "<span>zero</span>");
    i.is(render(ast({type: 1}, {})), "<p>component</p>");
    i.is(render(ast({type: 432}, {})), "any");
});

test("conditional: cases after default are skipped", async i => {
    const { ast } = await builder.componentify("skip-after-def.html");
    i.is(render(ast({value: 2},{})), "default");
});

test("conditional: wrong content", i => i.throwsAsync(() => builder.componentify("wrong-content.html")));

test("conditional: no cases", i => i.throwsAsync(() => builder.componentify("no-cases.html")));

test("conditional: empty condition", i => i.throwsAsync(() => builder.componentify("empty-condition.html")));