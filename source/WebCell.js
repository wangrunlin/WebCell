import { parseDOM } from 'dom-renderer';

import Component from './component/Component';

import { multipleMap, decoratorOf, unique } from './utility/object';

import { delegate } from './utility/DOM';

import { blobFrom } from './utility/resource';


/**
 * Decorator for `observedAttributes` getter
 *
 * @param {DecoratorDescriptor} meta
 */
export function mapProperty(meta) {

    const getter = meta.descriptor.get;

    meta.descriptor.get = function () {

        const list = getter.call( this );

        for (let key of list)
            if (
                Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)  &&
                !Object.getOwnPropertyDescriptor(this.constructor.prototype, key)
            )
                throw ReferenceError(
                    `HTML DOM property "${key}" getter should be overwritten`
                );

        return  this.linkDataOf( list );
    };
}


/**
 * Decorator for `attributeChangedCallback()` method
 *
 * @param {DecoratorDescriptor} meta
 */
export function mapData(meta) {

    const origin = meta.descriptor.value,
        onChange = Component.prototype.attributeChangedCallback;

    meta.descriptor.value = function (name, oldValue) {

        origin.call(this,  name,  oldValue,  onChange.apply(this, arguments));
    };
}


/**
 * Decorator for Property getter which returns Data URI
 *
 * @param {DecoratorDescriptor} meta
 */
export function blobURI(meta) {

    var getter = meta.descriptor.get, blob;

    meta.descriptor.get = function () {

        return  blob || (
            blob = URL.createObjectURL(
                blobFrom( getter.apply(this, arguments) )
            )
        );
    };
}


/**
 * @param {String} selector - CSS selector
 *
 * @return {Function} Decorator for Event handler
 */
export function at(selector) {

    return  ({ descriptor }) => {

        descriptor.value = delegate(selector, descriptor.value);
    };
}


/**
 * @param {String} type
 * @param {String} selector
 *
 * @return {Function} Decorator for Event handler
 */
export function on(type, selector) {

    return  meta => {

        meta.finisher = Class => {

            Class.on(type, selector, meta.descriptor.value);
        };
    };
}


const skip_key = {
    name:         1,
    length:       1,
    prototype:    1,
    caller:       1,
    arguments:    1,
    call:         1,
    apply:        1,
    bind:         1,
    constructor:  1
};

function decoratorMix(mixin) {

    const isClass = mixin instanceof Function;

    return multipleMap(
        Object.entries( Object.getOwnPropertyDescriptors( mixin ) ),
        ([key, meta]) => {

            if (! (isClass  ?  skip_key[key]  :  (
                (key === 'constructor')  &&  (meta.value instanceof Function)
            )))
                return  decoratorOf(mixin,  key,  meta.value || meta);
        }
    );
}


function define(meta, template, style) {

    if ( template ) {

        template = parseDOM( (template + '').trim() );

        let _temp_ = template.querySelector('template');

        if (! _temp_) {

            _temp_ = document.createElement('template');

            _temp_.content.appendChild( template );
        }

        template = _temp_;
    }

    if ( style ) {

        template = template || document.createElement('template');

        template.content.insertBefore(
            Object.assign(
                document.createElement('style'),  {textContent: style}
            ),
            template.content.firstChild
        );

        meta.push( decoratorOf(Component, 'style', style) );
    }

    if ( template ) {

        template = template.innerHTML;

        meta.push( decoratorOf(Component, 'template', template) );
    }

    return template;
}


/**
 * Register a component
 *
 * @param {Object}         meta
 * @param {String|Node}    [meta.template] - HTML template source or sub DOM tree
 * @param {String|Element} [meta.style]    - CSS source or `<style />`
 * @param {Object}         [meta.data]     - Initial data
 * @param {String}         [meta.tagName]  - Name of an HTML original tag to extend
 *
 * @return {function(elements: DecoratorDescriptor[]): Object} Component class decorator
 */
export function component(meta = { }) {

    var {template, style, data, tagName} = meta;

    return  ({elements}) => {

        const merged = (template || style)  &&
            define(elements, template, style);

        if ( data )  elements.push( decoratorOf(Component, 'data', data) );

        elements.push(
            ... decoratorMix( Component ),
            ... decoratorMix( Component.prototype )
        );

        return {
            kind:           'class',
            elements:       unique(
                elements,
                (A, B)  =>  ((A.key !== B.key) || (A.placement !== B.placement))
            ),
            finisher(Class) {
                if (
                    merged  &&  self.ShadyCSS  &&
                    !(ShadyCSS.nativeCss && ShadyCSS.nativeShadow)
                )
                    ShadyCSS.prepareTemplate(merged, Class.tagName);

                self.customElements.define(
                    Class.tagName,  Class,  tagName && {extends: tagName}
                );
            }
        };
    };
}

export { Component };

export {default as InputComponent} from './component/InputComponent';

export * from './utility/object';

export * from './utility/DOM';

export * from './utility/resource';
