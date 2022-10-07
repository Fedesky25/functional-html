const test = require("ava").default;
const { render } = require("posthtml-render");
const { componentify } = require("../dist/index.js");

test("throws on invalid path", async i => {
    const c = componentify("test/unexistant.html");
    await i.throwsAsync(c);
});

test("throws on wrong extension", async i => {
    const c = componentify("test/index.txt");
    await i.throwsAsync(c);
})

test("throws on empty template", async i => {
    const c = componentify("test/basics/NoTemplate.html");
    await i.throwsAsync(c);
});

test("component renders", async i => {
    const c = await componentify("test/basics/SingleNode.html");
    i.truthy(c({},{}));
});

test("single node template", async i => {
    const c = await componentify("test/basics/SingleNode.html");
    const r = render(c({}));
    i.is(r, "<p>single node</p>");
});

test("caching same component", i => {
    const c1 = componentify("test/Simple.html");
    const c2 = componentify("test/Simple.html");
    i.is(c1,c2);
});