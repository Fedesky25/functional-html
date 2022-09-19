const test = require("ava").default;
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
    const c = componentify("test/NoTemplate.html");
    await i.throwsAsync(c);
});

test("component renders", async i => {
    const c = await componentify("test/Simple.html");
    i.truthy(c({},{}));
});

test("caching same component", i => {
    const c1 = componentify("test/Simple.html");
    const c2 = componentify("test/Simple.html");
    i.is(c1,c2);
});