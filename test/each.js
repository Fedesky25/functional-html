const test = require("ava").default;
const { render } = require("posthtml-render");
const { Builder } = require("../dist/index.js");

const builder = new Builder("test");

test("each: empty", async i => {
    const c = await builder.componentify("each/empty.html");
    i.is(render(c.ast({})), "");
});

test("each: no item", async i => {
    const c = await builder.componentify("each/no-item.html");
    i.is(render(c.ast({})), "aaa");
});

test("each: only index", async i => {
    const c = await builder.componentify("each/only-index.html");
    i.is(render(c.ast({})), "012");
});

test("each: not-array", async i => {
    const c = await builder.componentify("each/not-array.html");
    i.throws(() => c.ast({}));
});