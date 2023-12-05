/**
 * This function converts a DOM tree (what a browser parses HTML into) into a
 * hyperscript element tree (what JSX is compiled into). For example, given the
 * following HTML existing somewhere on a web page:
 * ```
 * <template id="example">
 *   <my-component>
 *     <span>hello world</span>
 *   </my-component>
 *   <div>goodbye</div>
 * </template>
 * ```
 *
 * Then the following code:
 * ```
 * import { h, Fragment } from 'preact'; // Or any JSX-supporting framework.
 * ...
 * const domFragment = document.getElementById('example').content;
 * const components = {
 *   'my-component': MyComponent
 * }
 * const App = hyperscriptify(domFragment, h, Fragment, components)
 * ```
 *
 * Would be equivalent to the following JSX code:
 * ```
 * const App =
 *   <>
 *     <MyComponent>
 *       <span>hello world</span>
 *     </MyComponent>
 *     <div>goodbye</div>
 *   </>
 * ```
 *
 * A use-case for this is for when you want to use React (or other framework)
 * components within a web application that's partially rendered in a
 * non-JavaScript server-side language.
 *
 * @param domElementOrFragment
 *   A DOM Element or DocumentFragment.
 *
 * @param h
 *   A hyperscript function (e.g., Preact's h() function, React's
 *   createElement() function, or the equivalent from the desired framework).
 *   This function's signature must be (tagNameOrComponent, props, ...children).
 *
 * @param Fragment
 *   The component to use for creating a fragment. I.e., the component that a
 *   JSX compiler would compile <>...</> to. See
 *   https://react.dev/reference/react/Fragment for more details. This is used
 *   when the passed in domElementOrFragment is a DocumentFragment.
 *
 * @param components
 *   An object that maps element tag names to components. For example, if this
 *   object is { 'my-component-x': MyComponentX, 'my-component-y': MyComponentY },
 *   then if domElementOrFragment is a <my-component-x> element, this function
 *   will return h(MyComponentX, ...). Elements with tag names that aren't in
 *   the components object are passed to h() as strings. For example, if 'div'
 *   isn't one of the keys in components, then for <div> elements passed to this
 *   function, this function returns h('div', ...).
 *
 * @param options
 *   An object containing options for controlling this function's behavior.
 *   The only currently supported option is:
 *   - propsify: A function for customizing how the domElementOrFragment's
 *     attributes and slots (child elements with a slot attribute) are converted
 *     to the props object that gets passed to h().
 *
 * @returns {*}
 *   The result of calling h() with the info collected from domElementOrFragment.
 */
export default function hyperscriptify(domElementOrFragment, h, Fragment, components, options = {}) {
  // Collect basic info about the element or fragment.
  let element, tagName, component, attributes, childNodes;
  switch (domElementOrFragment.nodeType) {
    case Node.ELEMENT_NODE:
      element = domElementOrFragment;
      tagName = element.nodeName.toLowerCase();
      component = components[tagName];
      attributes = Object.fromEntries(element.getAttributeNames().map((name) => [name, element.getAttribute(name)]));
      childNodes = element.childNodes;
      break;
    case Node.DOCUMENT_FRAGMENT_NODE:
      component = Fragment;
      attributes = {};
      childNodes = domElementOrFragment.childNodes;
      break;
    default:
      return;
  }

  // Collect the element's or fragment's slots and children.
  const slots = {};
  const children = [];
  childNodes.forEach(function(childNode) {
    let child;
    switch (childNode.nodeType) {
      case Node.TEXT_NODE:
        child = childNode.nodeValue;
        break;
      case Node.ELEMENT_NODE:
        const slot = childNode.getAttribute('slot');
        child = hyperscriptify(childNode, h, Fragment, components, options);
        if (element && component && slot) {
          slots[slot] = child;
          child = null;
        }
        break;
    }
    if (child) {
      children.push(child);
    }
  });

  // For elements that have a slot attribute, and are child elements of a
  // component, this function uses that slot attribute to distribute that slot
  // content to the parent component's props (see the code above). Therefore,
  // don't also retain the slot attribute, since that could conflict with the
  // component's props expectations or trigger additional slot distribution by
  // the browser.
  if (attributes.slot && components[element.parentNode.nodeName.toLowerCase()]) {
    delete attributes.slot;
  }

  // Create a props object from the attributes and slots.
  const context = { tagName, component, element };
  const props = (element && options.propsify) ? options.propsify(attributes, slots, context) : { ...attributes, ...slots };

  return h(component || tagName, props, ...children);
}

/**
 * Converting from an HTML representation to a hyperscript (JSX) representation
 * requires mapping HTML attribute and slot semantics to JSX props semantics.
 * The details for what mapping is needed depends on the front-end framework and
 * components that are used. This basicPropsifyFactory() function returns a
 * propsify() implementation that's a reasonable starting point that could be
 * suitable for most apps. Apps for which this implementation isn't suitable can
 * implement their own propsify() function instead of using this factory.
 *
 * Usage:
 * ```
 * propsify = propsifyFactory({ ... }); // See docs for parameters below.
 *
 * // See hyperscriptify() docs for details about options.propsify.
 * hyperscriptify( ..., { propsify });
 * ```
 *
 * @param mapKeys
 *   The https://lodash.com/docs/4.17.15#mapKeys function or a similar
 *   implementation, such as https://github.com/angus-c/just/tree/master/packages/object-map-keys
 *   (or some other implementation) if wanting to minimize the app bundle size.
 *
 * @param mapValues
 *   The https://lodash.com/docs/4.17.15#mapValues function or a similar
 *   implementation, such as https://github.com/angus-c/just/tree/master/packages/object-map-values
 *   (or some other implementation) if wanting to minimize the app bundle size.
 *
 * @param set
 *   The https://lodash.com/docs/4.17.15#set function or a similar
 *   implementation, such as https://github.com/angus-c/just/tree/master/packages/object-safe-set
 *   (or some other implementation) if wanting to minimize the app bundle size.
 *
 * @param camelCase
 *   The https://lodash.com/docs/4.17.15#camelCase function or a similar
 *   implementation, such as https://github.com/angus-c/just/tree/master/packages/string-camel-case
 *   (or some other implementation) if wanting to minimize the app bundle size.
 *
 * @param htmlElementAttributeToPropMap
 *   (optional) An object that maps HTML attribute names to the hyperscript
 *   prop name. This map is used for HTML elements that do not correspond to
 *   hyperscript components. Some frameworks, like React, are strict in
 *   requiring that prop names for intrinsic HTML elements are the same as the
 *   element's DOM property name. When using such frameworks, the object
 *   exported by standard/reactHtmlAttributeToPropertyMap.js, or one similar to it,
 *   should be provided as this parameter. Other frameworks, like Preact, allow
 *   prop names for intrinsic HTML elements to be either the DOM property name
 *   or the HTML attribute name. For those frameworks, this parameter may be
 *   omitted.
 *
 * @param componentAttributeToPropMap
 *   (optional) Similar to htmlElementAttributeToPropMap, but this map is used
 *   for elements that do correspond to hyperscript components. Component
 *   attributes not in this map are mapped to the property by calling
 *   camelCase().
 *
 * @returns {function(*, *, *): *}
 *   The function to provide to hyperscriptify() for options.propsify.
 */
export function propsifyFactory({ mapKeys, mapValues, set, camelCase, htmlElementAttributeToPropMap = {}, componentAttributeToPropMap = {} }) {
  return function( attributes, slots, context ) {
    let props = { ...attributes };

    // For components (not intrinsic HTML elements)...
    if (context.component) {
      // HTML attribute names are case insensitive, normalized to lowercase, and
      // for custom elements, multi-word attribute names are by convention
      // kebab-cased. JSX prop names are case-sensitive and by convention,
      // camelCased.
      props = mapKeys(props, (value, key) => componentAttributeToPropMap[key] || camelCase(key));

      // HTML attribute values are strings. JSX prop values can be other data
      // types, such as objects or arrays. Therefore, if the attribute value is
      // a JSON string, parse it.
      props = mapValues(props, (value) => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });

      // HTML distinguishes between attributes and slots. In JSX, prop values
      // can be their own elements/components, so simply assign the slots into
      // props. The set() function allows slot names to be deep paths into
      // props. For example, a slot name of "a.b.c" would assign the slot value
      // into props.a.b.c.
      for (const slotName in slots) {
        set(props, slotName, slots[slotName]);
      }
    }
    // For intrinsic HTML elements...
    else {
      props = mapKeys(props, (value, key) => htmlElementAttributeToPropMap[key] || key);
    }

    return props;
  }
}
