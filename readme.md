# sig

high-level reactive-style programming in javascript

```javascript
var vv = require('drainpipe'),
    sig = require('sig-js'),
    map = sig.map,
    put = sig.put,
    log = sig.log

var s = sig()

vv(s)
  (map, function(x) { return x + 1 })
  (filter, function(x) { return x % 2 })
  (then, log)

vv(s)
  (put, 1)  // 2
  (put, 2)
  (put, 3)  // 5
```


# docs

  - [install](#install)
  - [overview](#overview)
  - [api](#api)


## install

node:

```
$ npm install sig
```

browser:

```
$ bower install sig
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

var t1 = then(s, function(v) { put(this, v + 1) })
var u1 = then(t1, log)

var t2 = then(s, function(v) { put(this, v * 2) })
var u2 = then(t2, log)

put(s, 3)
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

var t1 = except(s, function(e) { raise(this, e) })
var u1 = except(t1, log)

var t2 = except(s, function(e) { raise(this, e) })
var u2 = except(t2, log)

raise(s, new Error('o_O'))
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
var t = then(s, log)

pause(s)
put(s, 21)
put(s, 23)

resume(s)
// 21
// 23
```

### eager signals

Eager signals are signals that start off paused, but resume after their first target signal is added. Note that signals are eager by default.

```javascript
var s = sig()
put(s, 21)
put(s, 23)

then(s, log)
// 21
// 23
```

A signal can be set to non-eager by setting the signal's `eager` property to `false`.

```javascript
var s = sig()
s.eager = false
```

### disposal

When a signal is no longer needed, [`reset`](#resets) should be used. Resetting a signal resets its non-static properties, including its source and targets. Resetting a signal also has an effect on its transitive sources and targets, and is slightly more involved. This is detailed in the sections [top-down resets](#top-down-resets) and [bottom-up resets](bottom-up-resets) below.

Note that creating signals without reseting them when done with them will lead to memory leaks for the same reasons not removing event listeners will when using an event listener pattern.

### top-down resets

When a signal is reset, any chain of signals originating from it will no longer receive values, so every signal in the chain can be reset.

```javascript
var a = sig()
var b = sig()
var c = sig()
var d = sig()
var e = sig()

then(a, b)
then(b, c)
then(b, d)
//       a
//       |
//       v
//  ---- b      
// |     |
// v     v
// c     d     e

reset(a)
//       a
//        
//        
//       b      
//        
//        
// c     d     e

then(b, e)
//       a
//        
//        
//       b ----
//             |
//             v
// c     d     e
```

### bottom-up resets

When a signal is reset, the chain of signals ending with it (if any) will no longer be sending values to it, so it can be removed from the chain. However, unlike top-down resets, other signals in the chain cannot be reset, as sibling targets (targets with the same source) might still be around listening for new values. To prevent chains of unused target signals being kept in memory as a result of this, source signals forget a target signal when the target no longer has its own targets. Targets keep a reference to their source, so a signal chain will be restored if a new target gets added at the end of the chain.

```javascript
var a = sig()
var b = sig()
var c = sig()
var d = sig()
var e = sig()

then(a, b)
then(b, c)
then(b, d)
//       a
//       |
//       v
//  ---- b      
// |     |
// v     v
// c     d     e

reset(c)
//       a
//       |
//       v
//       b      
//       |
//       v
// c     d     e

reset(d)
//       a
//        
//        
//       b      
//        
//        
// c     d     e

then(b, e)
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
  var redirA = redir(a, out)
  var redirB = redir(b, out)
  return out
}


var a = sig()
var b = sig()
var out = join(a, b)
var logOut = then(out, log)

// single line for targets, double line for redirections
//
//   a                  b
//   |                  |
//   v                  v
// redirA ==> out <== redirB
//             |
//             v
//          logOut

put(a, 21)  // 21
put(b, 23)  // 23

reset(out)

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
then(v, log)  // 23
then(v, log)  // 23
```

A signal can also be set to sticky manually by setting the signal's `sticky` property to `true`.

```javascript
var s = sig()
s.eager = false
```


## api

### `sig([values])`

Creates a new signal. If a `values` array is given, it is used as the initial values put through the signal.

```javascript
var s = sig([1, 2, 3])
```

### `put(s, v)`

Puts the value `v` through the signal `s`, where `v` can be a value of any type.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
put(s, 23)  // 23
```

### `raise(s, e)`

Propogates the error instance `e` through the signal `e`.

```javascript
var s = sig()
except(s, log)

raise(s, new Error('o_O'))  // o_O
```

### `reset(s)`

Resets the given signal.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
reset(s)

put(s, 23)
```

### `then(s, fn)`

Creates and returns a new signal with `fn` as its receiver function and `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = then(s, function(v) { put(this, v + 2) })
then(t, log)

put(s, 21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = then(s, function(a, b, c) { put(this, a + b + c) }, 1, 2)
then(t, log)

put(s, 20)  // 23
```

### `then(s, t)`

Sets the signal `s` as the source of the signal `t` and returns `t`.  

```javascript
var s = sig()
var t = sig()
t.receiver = function(v) { return v }

then(s, t)
put(s, 23)  // 23
```

### `except(s, fn)`

Creates and returns a new signal with `fn` set as its error handling function and `s` as its source signal. `fn` is called with each raised error as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = except(s, log)

raise(s, new Error('o_O'))  // o_O
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = except(s, log)

raise(s, new Error('o_O'), '-_-', ':/')  // o_O -_- :/
```

### `map(s, fn)`

Creates and returns a new signal with a receiver function that calls `fn` and puts its return value through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = map(s, function(v) { return v + 2 })
then(t, log)

put(s, 21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = map(s, function(a, b, c) { put(this, a + b + c) }, 1, 2)
then(t, log)

put(s, 20)  // 23
```

### `filter(s, fn)`

Creates and returns a new signal with a receiver function that calls `fn` to determine whether to put each value recieved by the signal through the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()
var t = filter(s, function(v) { return v % 2 })
then(t, log)

put(s, 22)
put(s, 23)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()
var t = filter(s, function(a, b, c) { return (a + b + c) % 2 }, 1, 2)
then(t, log)

put(s, 22)  // 22
put(s, 23)
```

### `val([v])`

Creates and returns a new sticky signal. If `v` is given, it is used as the initial value for the created signal.

```javascript
var v = val(23)
then(v, log)  // 23
then(v, log)  // 23
```

### `ensure(v)`

If `v` is a signal, it is simply returned. Otherwise, a new signal is created with `v` as its initial value.

```javascript
var s = ensure(23)
then(v, log)  // 23
```

### `all(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array of the current values of each signal and non-signal each time one of the values changes. Note that the returned signal will only start outputting once each signal in the array has put through its first value.

```javascript
var s = sig()
var t = sig()
var u = all([s, 23, t])
then(u, log)

put(s, 1)
put(t, 3)  // [1, 23, 3]
put(s, 2)  // [2, 23, 3]
put(t, 1)  // [2, 23, 1]
put(s, 3)  // [3, 23, 1]
```

### `all(obj)`

Identical to [`all(values)`](#allvalues), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal.

```javascript
var s = sig()
var t = sig()
var u = all({
  a: s,
  b: 23,
  c: t
})
then(u, log)

put(s, 1)

put(t, 3)
// {
//   a: 1,
//   b: 23,
//   c: 3
// }

put(s, 2)
// {
//   a: 2,
//   b: 23,
//   c: 3
// }

put(t, 1)
// {
//   a: 2,
//   b: 23,
//   c: 1
// }

put(s, 3)
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
var u = any([s, 23, t])
then(u, spread, log)

put(s, 1)  // 1 0
put(t, 3)  // 3 2
put(s, 2)  // 2 0
put(t, 1)  // 1 2
put(s, 3)  // 3 0
```

### `any(obj)`

Identical to [`any(values)`](#anyvalues), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal are arrays, each containing the given value and its corresponding signal's key in the object.

```javascript
var s = sig()
var t = sig()
var u = any({
  a: s,
  b: 23,
  c: t
})
then(u, spread, log)

put(s, 1)  // 1 a
put(t, 3)  // 3 c
put(s, 2)  // 2 a
put(t, 1)  // 1 c
put(s, 3)  // 3 a
```

### `limit(s, n)`

Creates and returns a new signal that only propogates the first `n` values it receives from signal `s`.

```javascript
var s = sig()
var t = limit(s, 3)
then(t, log)

put(s, 21)  // 21
put(s, 22)  // 22
put(s, 23)  // 23
put(s, 23)
put(s, 23)
```

### `once(s)`

Special case of `limit` where `n === 1`.

```javascript
var s = sig()
var t = once(s)
then(t, log)

put(s, 21)  // 21
put(s, 22)
put(s, 23)
```

### `redir(s, t)`

Redirects values and errors put through signal `s` to signal `t`. The returned signal is a new signal that controls this redirection. When either it, `s` or `t` is reset, the redirection ends. `redir` behaves differently to `then`, as it does not set `s` as the source of `t`.

```javascript
function join(a, b) {
  var out = sig()
  redir(a, out)
  redir(b, out)
  return out
}


var a = sig()
var b = sig()
var s = join(a, b)
then(s, log)

put(a, 21)  // 21
put(b, 23)  // 23
```

### `source(t, s)`

Sets signal `s` as the source of signal `t` and returns `t`.

```javascript
var s = sig()
var t = sig()
then(t, log)

source(t, s)
put(s, 23)  // 23
```

### `unsource(t)`

Unsets the source signal of signal `t`.

```javascript
var s = sig()
var t = sig()
then(t, log)

source(t, s)
put(s, 21)  // 21

unsource(t)
put(s, 23)
```

### `receive(s, v)`

Gives the value `v` to the receiver function of signal `s`.

```javascript
var s = sig()
s.receiver = function(v) { console.log(v) }

receive(s, 23)  // 23
```

### `pause(s)`

Pauses signal `s`, causing any new values put through `s` to get buffered.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
pause(s)

put(s, 23)
resume(s)  // 23
```

### `resume(s)`

Resumes signal `s`, causing the buffered values to be sent to `s`'s targets and causing any new values to be sent to `s`'s targets.

```javascript
var s = sig()
then(s, log)

put(s, 21)  // 21
pause(s)

put(s, 23)
resume(s)  // 23
```

### `cleanup(s, fn)`

Schedules `fn` to be called when `s` is reset. `fn` is called with `s` as its `this` context.

```javascript
var s = sig()
var b = 2
cleanup(s, function() { b = null })

var t = map(s, function(a) { return a + b })
then(t, log)
put(s, 20)  // 23

reset(s)
log(b)  // null
```

### `spread(args, fn)`

Identical to [`Function.prototype.apply`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/apply), except it accepts the array of arguments as its first argument, the function as its last argument, and the `this` context `spread` is called with as the function call's `this` context. Useful for cases where the values put through a source signal are arrays of values and the target signal expects the values as separate arguments.

```javascript
var s = sig()
then(s, spread, log)
put(s, [1, 2, 3])  // 1 2 3
```

### `to(v, s)`

Identical to [`put`](#puts-v), except it takes the value as the first argument and the signal as the second argument. Helpful for situations where the value is calculated as the result of a chain of function calls.

```javascript
var s = sig()
then(s, log)

vv(23)
  (function(v) { return v * 2 })
  (function(v) { return v + 1 })
  (to, s)  // 47
```

### `putMany(s, values)`

Puts each value in a `values` array through the signal `s`.

```javascript
var s = sig()
then(s, log)

putMany(s, [1, 2, 3])
// 1
// 2
// 3
```

### `isSig(v)`

Returns `true` if `v` is a signal, `false` if it is not.

```javascript
isSig(23)  // => false
isSig(sig())  // => true
```

### `log([arg1[, arg2[, ...]]])`

Logs the given arguments. Identical to `console.log`, except it does not rely on `console` as its `this` context.
