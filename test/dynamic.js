const test = require("ava").default;
const { render } = require("posthtml-render");
const { createComponentFrom } = require("../dist/index");

test("dynamic tag", async i => {
    const c = await createComponentFrom('<template><dyn tag="props.tag"></dyn></template>', "test.html");
    i.is(render(c({tag: "p"})), "<p></p>");
});