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

### Declaring props

Props can be passed to any component, they are an object with string key and any value. Inside the template props are always accessible inside the `props` variable, but to ease the use of them one can declare them like so:

```html
<link rel="prop" title="things">
<link rel="prop" title="flag">
```

Which is translated into the js instruction

```js
const { things, flag } = props;
```

Therefore, the name of each prop must be a valid js name.

### Value interpolation

Inside text and attribute value of each tag you can interpolate any valid js expression using the `${<expression>}` notation.

```html
<link rel="prop" title="value">
<template>
    <p data-value="${value}">The value is: ${value.toFixed(2)}</p>
</template>
```

### Toggle classes

In addition to the value interpolation inside the attribute `class`, you can also use the directive `class:name="condition"`, inspired by [svelte](https://svelte.dev/), to toggle a class on a element.
The shorthand notation `class:name` stands for `class:name="name"`.

```html
<link rel="prop" title="text">
<link rel="prop" title="dark">
<template>
    <div class="card" class:dark>
        <p class:empty="!text">${text || "Empty card"}</p>
    </div>
</template>
```

### Conditional statement

Multiple cases can be specified inside a `conditional`: they are evaluated in the same order in which they appear. The condition of each case must be specified in the `if` attribute which can contain any valid javascript. Optionally a `default` tag which is evaluated when all previous cases failed (all cases after a default are thus skipped). Obviously, inside each case (or default) any html is valid. 

```html
<link rel="prop" title="msg">
<template>
    <conditional>
        <case if="!msg">Nothing here</case>
        <case if="typeof msg === 'string'">
            <p>We have a message for you: ${msg}</p>
        </case>
        <default>Something is off...</default>
        <case if="true">This will never be evaluated</case>
    </conditional>
</template>
```

### Importing components

Importing is done though a `link` tag with rel attribute set to `import`:

```html 
<link rel="import" href="path/to/your/component.html">
<link rel="import" href="path/to/your/other/component.html" as="second-component">
```

In the first case the component will be available in the template with name `component`, i.e. the basename of the file. In the second case, it will be available under the name `second-component`.

### Using components

Imported components are treated as HTML tags, but with the passibility to pass them props (and slots, next section). Props can be passed as if they were attribute of a normal tag: by default they are strings, but you can pass any javascript value by using the `@` charachter.

```html
<link rel="import" href="./Navigation.html">
<link rel="import" href="./Card.html">
<link rel="import" href="./Footer.html">
<link rel="prop" title="number">
<link rel="prop" title="type">
<template>
    <Navigation page="blog" />
    <!-- props = { page = "blog" } -->
    
    <Card title="${type}: Who are we?" authors="@ ['Beppe', 'Giovanna']" />
    <!-- props = { title: `${type}: Who are we?`, authors: ['Bepper', 'Giovanna'] } -->
    
    <Footer page-count="@ number" />
    <!-- props = { page_count: number } -->
</template>
```

### Component slots

Finally components can accept slots, html code inserted in specified positions.

```html
<!-- Cool-link.html -->
<link rel="prop" title="href">
<link rel="prop" title="text">
<template>
    <a href="${href}">
        <div class="border-1"></div>
        <span class="text">${text}</span>
        <div class="border-2"></div>
    </a>
<template>

<!-- Component.html -->
<template>
    <div class="container">
        <h3><slot name="title" /></h3>
        <div class="text">
            <slot name="text" />
        </div>
    </div>
<template>

<!-- page.html -->
<link rel="import" href="./Component.html">
<link rel="import" href="./Cool-link.html">
<template>
    <Component>
        <fragment slot="title">First Title</fragment>
        <fragment slot="text">
            <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
            <ul>
                <li>first item</li>
                <li>second item</li>
                <li>third item</li>
            </ul>
        </fragment>
    </Component>
    <hr class="divisor">
    <Component>
        <fragment slot="title">Second Title</fragment>
        <fragment slot="text">
            <p>Lorem ipsum dolor sit amet consectetur adipisicing elit.</p>
            <Cool-link href="./about" text="Discover more" />
        </fragment>
    </Component>
</template>
```

## Known issues

 - imported components name clashing
 - prop name can be js keywords
 - no prop type checking or hinting

## Future features

Depending on my future use of this package, on adoptions and request by others, I am willing to develop new features. The following list is my whishlist of features:

 - Passing additional props to components in a script tag inside component call
 - Maybe accepting also valid AST inside another script, for even more flexible control
 - Script tag before template containing code to run on compile time before constructing the AST
 - When content of a slot is a single tag, allow the option to specify the slot name as an attribute of that tag, without the need of enclosing it inside a fragment

Another brach of possibilities arise in including css and javascript for the browser. This could require defining a new extension and a language server for code editors. A completely analogous objective is already accomplished by [svelte](https://svelte.dev/), whose static rendering requires [SvelteKit](https://kit.svelte.dev/) though, which goes against my idea of simple straigh-forward static render out of the box with little to no setup, targetting small to medium projects.
Scoped css and scss support could be implemented via [PostCSS](https://postcss.org/). It would be awesome to include Typescript runtime code with easy links to declared DOM nodes (even though some care is needed in cases of conditionals and loops).