# sig

![Build Status](https://api.travis-ci.org/justinvdm/sig.png)


high-level reactive-style programming in javascript

```javascript
var s = sig()

s.map(function(x) { return x + 1 })
 .filter(function(x) { return x % 2 })
 .then(sig.log)

s.put(1)  // 2
 .put(2)
 .put(3)  // 5
```


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

### value propogation

Values are sent from a source signal to its target signals using [`put`](#puts-v). `put` sends the given value to the receiver function of each of its targets. [`then`](#thens-fn) is used to create a new target signal with a given receiver function. To further propogate the value, the receiver functions should use `put` to send the value from the relevant signal  (provided as the `this` context) to its target signals.

```javascript
var s = sig()

var t1 = s.then(function(v) { this.put(v + 1) })
var u1 = t1.then(sig.log)

var t2 = s.then(function(v) { this.put(v * 2) })
var u2 = t2.then(sig.log)

s.put(3)
// -- s --       
// | 3   | 3
// v     v
// t1    t2
// | 4   | 6
// v     v
// u1    u2
```

### error handling

Errors are raised for a signal using [`raise`](#raises-e). If a signal's error handler re-raises the error using `raise` itself, the error is propogated to each of the signal's target signals. If a signal's error handler re-raises an error and the signal has no targets, the error is thrown. [`except`](#exepts-e) is used to create a new target signal with a given error handling function.

```javascript
var s = sig()

var t1 = s.except(function(e) { this.raise(e) })
var u1 = t1.except(sig.log)

var t2 = s.except(function(e) { this.raise(e) })
var u2 = t2.except(sig.log)

s.raise(new Error('o_O'))
// ---- s ----       
// | o_O     | o_O
// v         v
// t1        t2
// | o_O     | o_O
// v         v
// u1        u2
```

Note that error handlers should always be used as a way to catch and process errors and not `try`-`catch` blocks, since signal processing can occur asynchronously (depending on how sig is being used). The reason for throwing unhandled errors at the end of signal chains is to break execution instead of allowing the error to get silently ignored.

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

When a signal is no longer needed, [`reset`](#resets) should be used. Resetting a signal resets its non-static properties, including its source and targets. Resetting a signal also has an effect on its transitive sources and targets, and is slightly more involved. This is detailed in the sections [top-down resets](#top-down-resets) and [bottom-up resets](#bottom-up-resets) below.

Note that creating signals without reseting them when done with them will lead to memory leaks for the same reasons not removing event listeners will when using an event listener pattern.

### top-down resets

When a signal is reset, any chain of signals originating from it will no longer receive values, so every signal in the chain can be reset.

```javascript
var a = sig()
var b = sig()
var c = sig()
var d = sig()
var e = sig()

a.then(b)
b.then(c)
b.then(d)
//       a
//       |
//       v
//  ---- b      
// |     |
// v     v
// c     d     e

a.reset()
//       a
//        
//        
//       b      
//        
//        
// c     d     e

b.then(e)
//       a
//        
//        
//       b ----
//             |
//             v
// c     d     e
```

### bottom-up resets

When a signal is reset, the chain of signals ending with it (if any) will no longer be sending values to it, so it can be removed from the chain. However, unlike top-down resets, other signals in the chain cannot be reset, as sibling targets (targets with the same source) might still be around listening for new values. To prevent chains of unused target signals being kept in memory as a result of this, source signals forget a target signal when the target no longer has its own targets, putting the target in a 'disconnected' state. Targets keep a reference to their source, so a signal chain will be reconnected if a new target gets added at the end of the chain.

```javascript
var a = sig()
var b = sig()
var c = sig()
var d = sig()
var e = sig()

a.then(b)
b.then(c)
b.then(d)
//       a
//       |
//       v
//  ---- b      
// |     |
// v     v
// c     d     e

c.reset()
//       a
//       |
//       v
//       b      
//       |
//       v
// c     d     e

d.reset()
//       a
//        
//        
//       b      
//        
//        
// c     d     e

b.then(e)
//       a
//       |
//       v
//       b ----
//             |
//             v
// c     d     e
```

### redirection

Sometimes, a function will return a single signal, though it has created one or more signal chains to send values to the returned signal. For these cases, `redir` should be used to allow values and errors to be redirected to the returned signal, and to set these chains to get reset when the returned signal is reset. If a function creates a signal chain, but the chain isn't returned or redirected, this will lead to memory leaks. Rule of thumb: either return a signal chain or redirect it to another returned signal.

```javascript
function join(a, b) {
  var out = sig()
  var redirA = a.redir(out)
  var redirB = b.redir(out)
  return out
}


var a = sig()
var b = sig()
var out = join(a, b)
var logOut = out.then(sig.log)

// single line for targets, double line for redirections
//
//   a                  b
//   |                  |
//   v                  v
// redirA ==> out <== redirB
//             |
//             v
//          logOut

a.put(21)  // 21
b.put(23)  // 23

out.reset()

// since redirA and redirB are targets of a and b respectively,
// them getting reset has the same effect on a and b that ordinary
// bottom-up resets would have
//
//   a                  b
//                      
//                      
// redirA     out     redirB
//              
//              
//          logOut
```

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

### `sig([values])`

Creates a new signal. If a `values` array is given, it is used as the initial values put through the signal.

```javascript
var s = sig([1, 2, 3])
```


### functions and methods

All sig functions are available as static functions off of `sig` itself. The following functions are also accessible as methods:

`reset`, `disconnect`, `reconnect`, `put`, `to`, `resolve`, `putMany`, `receive`, `source`, `unsource`, `pause`, `resume`, `raise`, `except`, `setup`, `teardown`, `map`, `filter`, `flatten`, `limit`, `once`, `then`, `redir`, `update`, `append`, `call`


### `put(s, v)`

Puts the value `v` through the signal `s`, where `v` can be a value of any type.

```javascript
var s = sig()
s.then(sig.log)

s.put(21)  // 21
 .put(21)  // 23
```

### `raise(s, e)`

Propogates the error instance `e` through the signal `s`.

```javascript
var s = sig()
s.except(sig.log)
s.raise(new Error('o_O'))  // o_O
```

### `reset(s)`

Resets the given signal.

```javascript
var s = sig()
s.then(sig.log)

s.put(21)  // 21
s.reset()

s.put(23)
```

### `then(s, fn)`

Creates and returns a new signal with `fn` as its receiver function and `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.then(function(v) { this.put(v + 2) })
 .then(sig.log)

s.put(21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.then(function(a, b, c) { this.put(a + b + c) }, 1, 2)
 .then(sig.log)

s.put(20)  // 23
```

### `then(s, t)`

Sets the signal `s` as the source of the signal `t` and returns `t`.  

```javascript
var s = sig()
var t = sig()
t.receiver = function(v) { return v }

s.then(t)
s.put(23)  // 23
```

### `except(s, fn)`

Creates and returns a new signal with `fn` set as its error handling function and `s` as its source signal. `fn` is called with each raised error as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
s.except(sig.log)
s.raise(new Error('o_O'))  // o_O
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
s.except(sig.log)
s.raise(new Error('o_O'), '-_-', ':/')  // o_O -_- :/
```

### `map(s, fn)`

Creates and returns a new signal with a receiver function that calls `fn` and puts its return value through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.map(function(v) { return v + 2 })
 .then(sig.log)

s.put(21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.map(function(a, b, c) { this.put(a + b + c) }, 1, 2)
 .then(sig.log)

s.put(20)  // 23
```

### `filter(s[, fn])`

Creates and returns a new signal with a receiver function that calls `fn` to determine whether to put each value recieved by the signal through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.filter(function(v) { return v % 2 })
 .then(sig.log)

s.put(22)
 .put(23)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.filter(function(a, b, c) { return (a + b + c) % 2 }, 1, 2)
 .then(sig.log)

s.put(22)  // 22
 .put(23)
```

If `fn` isn't provided, an identity function is used, filtering values based on their truthyness.

### `flatten(s)`

Creates and returns a new signal that puts through each non-array value in a series of possibly nested arrays.

```javascript
sig([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
  .flatten()
  .then(sig.log)
  
// [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```

### `val([v])`

Creates and returns a new sticky signal. If `v` is given, it is used as the initial value for the created signal.

```javascript
var v = sig.val(23)
v.then(sig.log)  // 23
v.then(sig.log)  // 23
```

### `ensure(v)`

If `v` is a signal, it is simply returned. Otherwise, a new signal is created with `v` as its initial value.

```javascript
var s = sig.ensure(23)
s.then(sig.log)  // 23
```

### `ensureVal(v)`

If a `v` is given, a sticky signal is returned with `v` as its initial value. If `v` is a signal, a new sticky signal is returned with `v` as its source.

```javascript
var v = sig.ensureVal(23)
v.then(sig.log)  // 23

var w = sig.ensureVal(sig([23]))
w.then(sig.log)  // 23
w.then(sig.log)  // 23
```

### `all(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array of the current values of each signal and non-signal each time one of the values changes. Note that the returned signal will only start outputting once each signal in the array has put through its first value.

```javascript
var s = sig()
var t = sig()

sig.all([s, 23, t])
  .then(sig.log)

s.put(1)
t.put(3)  // [1, 23, 3]
s.put(2)  // [2, 23, 3]
t.put(1)  // [2, 23, 1]
s.put(3)  // [3, 23, 1]
```

### `all(obj)`

Identical to [`all(values)`](#allvalues), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal.

```javascript
var s = sig()
var t = sig()

sig.all({
    a: s,
    b: 23,
    c: t
  })
  .then(sig.log)

s.put(1)

t.put(3)
// {
//   a: 1,
//   b: 23,
//   c: 3
// }

s.put(2)
// {
//   a: 2,
//   b: 23,
//   c: 3
// }

t.put(1)
// {
//   a: 2,
//   b: 23,
//   c: 1
// }

s.put(3)
// {
//   a: 3,
//   b: 23,
//   c: 1
// }
```

### `any(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array containing the value and its corresponding signal's index in the array whenever one of the signals in the array changes.

```javascript
var s = sig()
var t = sig()

sig.any([s, 23, t])
  .then(sig.spread, log)

s.put(1)  // 1 0
t.put(3)  // 3 2
s.put(2)  // 2 0
t.put(1)  // 1 2
s.put(3)  // 3 0
```

### `any(obj)`

Identical to [`any(values)`](#anyvalues), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal are arrays, each containing the given value and its corresponding signal's key in the object.

```javascript
var s = sig()
var t = sig()

sig.any({
    a: s,
    b: 23,
    c: t
  })
  .then(sig.spread, log)

s.put(1)  // 1 a
t.put(3)  // 3 c
s.put(2)  // 2 a
t.put(1)  // 1 c
s.put(3)  // 3 a
```

### `merge(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs the values put through each signal in the array.

```javascript
var s = sig()
var t = sig()

sig.merge([s, 23, t])
  .then(sig.log)

s.put(1)  // 1
t.put(3)  // 3
s.put(2)  // 2
t.put(1)  // 1
s.put(3)  // 3
```

### `merge(obj)`

Identical to [`merge(values)`](#mergevalues), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal the values put through each signal in the object.

```javascript
var s = sig()
var t = sig()

sig.merge({
    a: s,
    b: 23,
    c: t
  })
  .then(sig.log)

s.put(1)  // 1
t.put(3)  // 3
s.put(2)  // 2
t.put(1)  // 1
s.put(3)  // 3
```

### `update(s[, fn])`

Returns a signal that 'updates' to proxy the signal most recently generated by a function `fn` mapping a signal `s`'s output values.

```javascript
var s = sig()

var lookup = {
  t: sig()
  u: sig()
}

s.update(function(k) { return lookup[k] })
 .then(sig.log)

s.put('t')

lookup.t
 .put(1)  // 1
 .put(2)  // 2
 .put(3)  // 3

s.put('u')

lookup.u
 .put(4)  // 4
 .put(5)  // 5
 .put(6)  // 6

lookup.t
 .put(7)
 .put(8)
 .put(9)
```

If `fn` returns a non-signal, its result is ignored.

If `fn` isn't given, an identity function is used as the default. This can be useful for turning a signal of signals into a single signal.

```javascript
var s = sig()
var t = sig()
var u = sig()

s.update()
 .then(sig.log)

s.put(t)

t.put(1)  // 1
 .put(2)  // 2
 .put(3)  // 3

s.put(u)

u.put(4)  // 4
 .put(5)  // 5
 .put(6)  // 6

t.put(7)
 .put(8)
 .put(9)
```

### `append(s[, fn])`

Returns a signal that proxies every signal generated by a function `fn` mapping a signal `s`'s output values. Each time a new signal is generated, it is 'appended' to the signals being tracked, so outputs of previous signals will still be proxied when a new signal is generated by `fn`.

```javascript
var s = sig()

var lookup = {
  t: sig()
  u: sig()
}

s.append(function(k) { return lookup[k] })
 .then(sig.log)

s.put('t')

lookup.t
 .put(1)  // 1
 .put(2)  // 2
 .put(3)  // 3

s.put('u')

lookup.u
 .put(4)  // 4
 .put(5)  // 5
 .put(6)  // 6

lookup.t
 .put(7)  // 7
 .put(8)  // 8
 .put(9)  // 9
```

If `fn` returns a non-signal, its result is ignored.

If `fn` isn't given, an identity function is used as the default. This can be useful for turning a signal of signals into a single signal.

```javascript
var s = sig()
var t = sig()
var u = sig()

s.append()
 .then(sig.log)

s.put(t)

t.put(1)  // 1
 .put(2)  // 2
 .put(3)  // 3

s.put(u)

u.put(4)  // 4
 .put(5)  // 5
 .put(6)  // 6

t.put(7)  // 7
 .put(8)  // 8
 .put(9)  // 9
```

### `limit(s, n)`

Creates and returns a new signal that only propogates the first `n` values it receives from signal `s`.

```javascript
var s = sig()

s.limit(3)
 .then(sig.log)

s.put(21)  // 21
 .put(22)  // 22
 .put(23)  // 23
 .put(24)
 .put(25)
```

### `once(s)`

Special case of `limit` where `n === 1`.

```javascript
var s = sig()

s.once()
 .then(sig.log)

s.put(21)  // 21
 .put(22)
 .put(23)
```

### `redir(s, t)`

Redirects values and errors put through signal `s` to signal `t`. The returned signal is a new signal that controls this redirection. When either it, `s` or `t` is reset, the redirection ends. `redir` behaves differently to `then`, as it does not set `s` as the source of `t`.

```javascript
function join(a, b) {
  var out = sig()
  a.redir(out)
  b.redir(out)
  return out
}


var a = sig()
var b = sig()
join(a, b).then(sig.log)

a.put(21)  // 21
b.put(23)  // 23
```

### `source(t, s)`

Sets signal `s` as the source of signal `t` and returns `t`.

```javascript
var s = sig()
var t = sig()
t.then(sig.log)

t.source(s)
s.put(23)  // 23
```

### `unsource(t)`

Unsets the source signal of signal `t`.

```javascript
var s = sig()
var t = sig()
t.then(log)

t.source(s)
s.put(21)  // 21

t.unsource()
s.put(23)
```

### `receive(s, v)`

Gives the value `v` to the receiver function of signal `s`.

```javascript
var s = sig()
s.receiver = function(v) { console.log(v) }

s.receive(23)  // 23
```

### `pause(s)`

Pauses signal `s`, causing any new values put through `s` to get buffered.

```javascript
var s = sig()
s.then(sig.log)

s.put(21)  // 21
s.pause()

s.put(23)
s.resume()  // 23
```

### `resume(s)`

Resumes signal `s`, causing the buffered values to be sent to `s`'s targets and causing any new values to be sent to `s`'s targets.

```javascript
var s = sig()
s.then(sig.log)

s.put(21)  // 21
s.pause()

s.put(23)
s.resume()  // 23
```

### `setup(s, fn)`

Calls `fn`, then schedules it to be called again when `s` is reconnected because of a [bottom-up reset](#bottom-up-resets), followed by a new target. `fn` is called with `s` as its `this` context. Any state used by the signal should be initialised inside a setup function.

```javascript
function tick() {
  var id
  var s = sig()

  // this setup function gets called immediately
  s.setup(function() {
    id = setInterval(resolve, 200, s)
  })

  s.teardown(function() {
    clearInterval(id)
  })

  return s
}

var s = tick()
var t = s.then(sig.log)

// the teardown function would get called here
t.reset()

// a reconnect occurs at this point since `s` has regained a target, so the setup
// function would get called here
s.then(sig.log)
```

### `teardown(s, fn)`

Schedules `fn` to be called when `s` is reset and when `s` is disconnected because of a [bottom-up reset](#bottom-up-resets). `fn` is called with `s` as its `this` context. Any state used by the signal should be deconstructed inside a teardown function.

```javascript
function tick() {
  var s = sig()
  var id

  s.setup(function() {
    id = setInterval(resolve, 200, s)
  })

  s.teardown(function() {
    clearInterval(id)
  })

  return s
}

var s = tick()
var t = s.then(sig.log)

// this would call the teardown function because of a bottom-up disconnect
t.reset()

// this would call the teardown function because `s` gets reset explicitly
s.reset()
```

### `spread(args, fn)`

Identical to [`Function.prototype.apply`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply), except it accepts the array of arguments as its first argument, the function as its last argument, and the `this` context `spread` is called with as the function call's `this` context. Useful for cases where the values put through a source signal are arrays of values and the target signal expects the values as separate arguments.

```javascript
var s = sig()
s.then(sig.spread, sig.log)
s.put([1, 2, 3])  // 1 2 3
```

### `to(v, s)`

Identical to [`put`](#puts-v), except it takes the value as the first argument and the signal as the second argument. Helpful for situations where the value is calculated as the result of a chain of function calls.

```javascript
var s = sig()
s.then(sig.log)
sig.to(23, s)  // 23
```

### `resolve(s)`

Special case of [`put`](#puts-v) where `v` is `null`.

```javascript
var s = sig()
s.then(sig.log)

s.resolve()  // null
```

### `putMany(s, values)`

Puts each value in a `values` array through the signal `s`.

```javascript
var s = sig()
s.then(sig.log)

s.putMany([1, 2, 3])
// 1
// 2
// 3
```

### `isSig(v)`

Returns `true` if `v` is a signal, `false` if it is not.

```javascript
sig.isSig(23)  // => false
sig.isSig(sig())  // => true
```

### `log([arg1[, arg2[, ...]]])`

Logs the given arguments. Identical to `console.log`, except it does not rely on `console` as its `this` context.
