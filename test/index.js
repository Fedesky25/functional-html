const test = require("ava").default;
const { render } = require("posthtml-render");
const { Builder } = require("../dist/index.js");

const builder = new Builder("test");

test("throws on invalid path", async i => {
    const c = builder.componentify("unexistant.html");
    await i.throwsAsync(c);
});

test("throws on wrong extension", async i => {
    const c = builder.componentify("index.txt");
    await i.throwsAsync(c);
})

test("throws on empty template", async i => {
    const c = builder.componentify("basics/NoTemplate.html");
    await i.throwsAsync(c);
});

test("component renders", async i => {
    const c = await builder.componentify("basics/SingleNode.html");
    i.truthy(c.ast({},{}));
});

test("single node template", async i => {
    const c = await builder.componentify("basics/SingleNode.html");
    const r = render(c.ast({}));
    i.is(r, "<p>single node</p>");
});

test("caching same component", async i => {
    const c1 = builder.componentify("Simple.html");
    const c2 = builder.componentify("Simple.html");
    i.is(await c1, await c2);
});