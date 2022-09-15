# HTML Components

Start using HTML with components! This is a small typescript package that allows you to convert html component files into standard PostHTML [Abstract Syntax Tree](https://www.wikiwand.com/en/Abstract_syntax_tree) (AST).

## Example 

A `Navbar.html` file:

```html
<link rel="prop" title="page">
<template>
    <nav>
        <a href="/"><img src="./logo.png" alt="Logo"></a>
        <ul class="links">
            <li class:active="page === 'home'">Home</li>
            <li class:active="page === 'about'">About</li>
        </ul>
    </nav>
</template>
```

An `index.html` file:

```html
<link rel="import" href="./Navbar.html">
<link rel="prop" title="things">
<template>
    <Navbar page="about"></Navbar>
    <h1>About us</h1>
    <p>
        <conditional>
            <case if="things.length === 0">There's nothing</case>
            <case if="things.length < 5">We have ${things.length} things to tell you:</case>
            <default>There are too many things to tell you</default>
        </conditional>
    </p>
    <ul>
        <each item in="things">
            <li>${item}</li>
        </each>
    </ul>
</template>
```

By running the following

```js
import { componentify } from "html-components";

const index = await componentify("./index.html");
index({
    things: ["first", "second"]
});
```

Results in an AST which rendered looks like:

```html
<nav><a href="/"><img src="./logo.png" alt="Logo"></a><ul class="links"><li>Home</li><li class="active">About</li></ul></nav><h1>About us</h1>We have 2 things to tell you:<ul><li>first</li><li>second</li></ul>
```

## Syntax

Each file describing a valid html component must have as direct child a single `template` tag.
Other valid direct children are `link` tags with `rel` attribute set to `import` or `prop`.
The HTML code inside the template has superpowers, described in the following sections.

### Importing components

