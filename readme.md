# sig

![Build Status](https://api.travis-ci.org/justinvdm/sig.png)

high-level reactive-style programming in javascript

```javascript
var s = sig()

s.map(function(x) { return x + 1 })
 .filter(function(x) { return x % 2 })
 .each(sig.log)

s.put(1)  // 2
 .put(2)
 .put(3)  // 5
```

**note** sig is far from stable or usable at the moment, expect drastic changes and don't use it in a production environment.

## docs

  - [install](#install)
  - [overview](#overview)
  - [api](#api)


## install

node:

```
$ npm install sig-js
```

browser:

```
$ bower install sig-js
```

```html
<script src="/bower_components/sig-js/sig.js"></script>
```


## overview

### sources and targets

Signals can have at most one source and multiple targets, where values and errors flow from the source to its targets.

### value propagation

Values propagate from a source signal to its target signals using [`.put()`](#put). `.put()` sends the given value to the receiver function of each of its targets. [`.then()`](#then-fn) is used to create a new target signal with a given handler function. To further propagate the value, handler functions should use `.put()` to send the value from the relevant signal  (provided as the `this` context) to its target signals. Once the the handler function has completed its processing, it should tell the signal that its ready to handle the next value or error using [`.next()`](#next).

```javascript
var s = sig()

var t1 = s.then(function(v) { this.put(v + 1).next() })
var u1 = t1.each(sig.log)

var t2 = s.then(function(v) { this.put(v * 2).next() })
var u2 = t2.each(sig.log)

s.put(3)
// -- s --       
// | 3   | 3
// v     v
// t1    t2
// | 4   | 6
// v     v
// u1    u2
```

Since sychronous handlers are likely to always call `.next()` at the end, [`.each()`](#each) is available as a thin wrapper around `.then()` that calls `.next()` itself once the given function has been called.

### error handling

Errors propagate from a source signal to its target signals using [`.throw()`](#throw), much in the same way values propagate with [`.put()`](#put). [`catch`](#catch) is used to create a new target signal with a given error handling function. As is the case for value propagation, the error handling function needs to call `.next()` to tell the signal to handle the next value or error.

```javascript
var s = sig()

var t1 = s.catch(function(e) { this.throw(e).next() })
var u1 = t1.catch(sig.log)

var t2 = s.catch(function(e) { this.throw(e).next() })
var u2 = t2.catch(sig.log)

s.throw(new Error('o_O'))
// ---- s ----       
// | o_O     | o_O
// v         v
// t1        t2
// | o_O     | o_O
// v         v
// u1        u2
```

Error handler functions can also propogate values, which is useful for cases where a signal can recover from an error.

```javascript
var s = sig()

s.catch(function() { this.put(null).next() })
 .each(sig.log)

s.put(21)  // 21
 .throw(new Error('o_O'))  // null
 .put(23)  // 23
```

If an error has put the signal into a state it cannot recover from, [`.kill()`](#kill) can be used to kill the signal.

```javascript
var s = sig()
  .catch(function() { this.kill() })
```

Unhandled errors that reach the end of a chain of signals get rethrown. Note that error handlers should always be used as a way to catch and process errors and not `try`-`catch` blocks, since signal processing can occur asynchronously (depending on how sig is being used). The reason for throwing unhandled errors at the end of signal chains is to break execution instead of allowing the error to get silently ignored.

### pausing and resuming

When a signal is paused using [`pause`](#pauses), any values given to it by [`put`](#puts-v) are buffered. When the signal is resumed using [`resume`](#resume-s), any buffered values are sent to the signal's targets, and any new values will be sent straight to the signal's targets (and not get buffered).

```javascript
var s = sig()
var t = s.then(sig.log)

s.pause()
 .put(21)
 .put(23)

s.resume()
// 21
// 23
```

### eager signals

Eager signals are signals that start off paused, but resume after their first target signal is added. Note that signals are eager by default.

```javascript
var s = sig()
  .put(21)
  .put(23)

s.then(sig.log)
// 21
// 23
```

A signal can be set to non-eager by setting the signal's `eager` property to `false`.

```javascript
var s = sig()
s.eager = false
```

### disposal

### redirection

### sticky signals

Sometimes, a signal needs to hold onto the last value that was [`put`](#puts-v) through it. When new targets arrive, they need to receive this last value instead of having them simply 'miss the bus' and only receive new values put through the source signal. Sticky signals allow this.

The common way to create a sticky signal is using [`val`](#valv).

```javascript
var v = val(23)
v.then(sig.log)  // 23
v.then(sig.log)  // 23
```

A signal can also be set to sticky manually by setting the signal's `sticky` property to `true`.

```javascript
var s = sig()
s.sticky = true
```


## api

<a name="sig"></a>
####`sig([values])`

Creates a new signal. If a `values` array is given, it is used as the initial values put through the signal.

```javascript
var s = sig([1, 2, 3])
```


### functions and methods

The following sig methods are also accessible as static functions taking a signal as the first argument:

`put`, `next`, `kill`, `resolve`, `putMany`, `receive`, `pause`, `resume`, `throw`, `catch`, `teardown`, `each`, `map`, `filter`, `flatten`, `limit`, `once`, `then`, `redir`, `update`, `append`, `call`

For example, using the static counterpart of [`.put`](#put) would look something like:

```javascript
var s = sig()
s.each(sig.log)

sig.put(s, 21)  // 21
sig.put(s, 23)  // 23
```


<a name="put"></a>
### `.put([v])`

Puts the value `v` through the signal, where `v` can be a value of any type.

```javascript
var s = sig()
s.then(sig.log)

s.put(21)  // 21
 .put(21)  // 23
```

<a name="next"></a>
### `.next()`


<a name="throw"></a>
### `.throw(e)`

Propogates the error instance `e` from the signal.

```javascript
var s = sig()
s.catch(sig.log)
s.throw(new Error('o_O'))  // o_O
```


<a name="kill"></a>
### `.kill()`

Kills the given signal.

```javascript
var s = sig()
s.each(sig.log)

s.put(21)  // 21
 .kill()
 .put(23)
```


<a name="pause"></a>
### `.pause()`

Pauses signal, causing any new values propagating from the signal to get buffered.

```javascript
var s = sig()
s.each(sig.log)

s.put(21)  // 21
 .pause()
 .put(23)
 .resume()  // 23
```


<a name="resume"></a>
### `.resume()`

Resumes the signal, causing the buffered values to propagate to the signal's targets and causing any new values to be sent to the signal's targets.

```javascript
var s = sig()
s.each(sig.log)

s.put(21)  // 21
 .pause()
 .put(23)
 .resume()  // 23
```


<a name="then-fn"></a>
### `.then(fn[, args...])`


<a name="then-s"></a>
### `.then(s)`


<a name="catch"></a>
### `.catch(fn[, args...])`


<a name="each"></a>
### `.each(fn[, args...])`


<a name="map-fn"></a>
### `.map(fn[, args...])`


<a name="map-v"></a>
### `.map(v)`


<a name="filter"></a>
### `.filter(fn[, args...])`


<a name="redir"></a>
### `.redir(t)`


<a name="flatten"></a>
### `.flatten()`


<a name="limit"></a>
### `.limit(n)`


<a name="once"></a>
### `.once()`


<a name="update"></a>
### `.update(fn[, args...])`


<a name="append"></a>
### `.append(fn[, args...])`


<a name="call"></a>
### `.call(fn[, args...])`


<a name="teardown"></a>
### `.teardown(fn[, args...])`


<a name="resolve"></a>
### `.resolve([v])`


<a name="putMany"></a>
### `.putMany()`


<a name="to"></a>
### `.to(t)`


<a name="val"></a>
### `sig.val([v])`


<a name="ensure"></a>
### `sig.ensure(v)`


<a name="ensure-val"></a>
### `sig.ensureVal(v)`


<a name="any-arr"></a>
### `sig.any(arr)`


<a name="any-obj"></a>
### `sig.any(obj)`


<a name="any-arr"></a>
### `sig.all(arr)`


<a name="any-obj"></a>
### `sig.all(obj)`


<a name="merge-arr"></a>
### `sig.merge(arr)`


<a name="merge-obj"></a>
### `sig.merge(obj)`


<a name="isSig"></a>
### `sig.isSig(v)`


<a name="log"></a>
### `sig.log(v)`


<a name="to-static"></a>
### `sig.to(v, s)`
