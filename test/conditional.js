const test = require("ava").default;
const { render } = require("posthtml-render");
const { componentify } = require("../dist/index.js");

test("conditional: basics", async i => {
    const c = await componentify("test/conditional/basic.html");
    i.is(render(c({type: 0}, {})), "<span>zero</span>");
    i.is(render(c({type: 1}, {})), "<p>component</p>");
    i.is(render(c({type: 432}, {})), "any");
});

test("conditional: cases after default are skipped", async i => {
    const c = await componentify("test/conditional/skip-after-def.html");
    i.is(render(c({value: 2},{})), "default");
});

test("conditional: wrong content", i => i.throwsAsync(() => componentify("test/conditional/wrong-content.html")));

test("conditional: no cases", i => i.throwsAsync(() => componentify("test/conditional/no-cases.html")));

test("conditional: empty condition", i => i.throwsAsync(() => componentify("test/conditional/empty-condition.html")));