# sig

![Build Status](https://api.travis-ci.org/justinvdm/sig.png)

high-level reactive-style programming in javascript

```javascript
var s = sig()

s.map(function(x) { return x + 1 })
 .filter(function(x) { return !(x % 2) })
 .each(sig.log)
 .done()

s.put(1)  // 2
 .put(2)
 .put(3)  // 4
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

Values propagate from a source signal to its target signals using [`.put()`](#put). `.put()` sends the given value to the value handler of each of its targets. [`.then()`](#then-fn) is used to create a new target signal with a given handler function. To further propagate the value, handler functions should use `.put()` to send the value from the relevant signal  (provided as the `this` context) to its target signals. Once the the handler function has completed its processing, it should tell the signal that its ready to handle the next value or error using [`.next()`](#next).

```javascript
var s = sig()

var t1 = s.then(function(v) { this.put(v + 1).next() })
var u1 = t1.each(sig.log)
u1.done()

var t2 = s.then(function(v) { this.put(v * 2).next() })
var u2 = t2.each(sig.log)
u2.done()

s.put(3)
// -- s --       
// | 3   | 3
// v     v
// t1    t2
// | 4   | 6
// v     v
// u1    u2
```

If any new values or errors are received before `.next()` has been called, they will get buffered, then popped off once the signal is ready to process them.

Since sychronous handlers are likely to always call `.next()` at the end, [`.each()`](#each) is available as a thin wrapper around `.then()` that calls `.next()` itself once the given function has been called.

<a name="error-handling"></a>
### error handling

Errors propagate from a source signal to its target signals using [`.throw()`](#throw), much in the same way values propagate with [`.put()`](#put). [`catch`](#catch) is used to create a new target signal with a given error handler. As is the case for value propagation, the error handler needs to call [`.next()`](#next) to tell the signal to handle the next value or error.

```javascript
var s = sig()

var t1 = s.catch(function(e) { this.throw(e).next() })
var u1 = t1.catch(sig.log)
u1.done()

var t2 = s.catch(function(e) { this.throw(e).next() })
var u2 = t2.catch(sig.log)
u2.done()

s.throw(new Error('o_O'))
// ---- s ----       
// | o_O     | o_O
// v         v
// t1        t2
// | o_O     | o_O
// v         v
// u1        u2
```

Error handler functions can also propagate values, which is useful for cases where a signal can recover from an error.

```javascript
var s = sig()

s.catch(function() { this.put(null).next() })
 .each(sig.log)
 .done()

s.put(21)  // 21
 .throw(new Error('o_O'))  // null
 .put(23)  // 23
```

If an error has put the signal into a state it cannot recover from, [`.kill()`](#kill) can be used to end the signal, regardless of whether there are still values to be sent.

```javascript
var s = sig()
  .catch(function() { this.kill() })
  .done()
```

Note that `.throw()` and `.catch()` should always be used as a way to propagate and handle errors occuring in a chain of signals, as opposed to javascript's native `throw` and `try`-`catch` error handling, since signal processing can occur asynchronously (depending on how sig is being used).

<a name="ending-chains"></a>
### ending chains

At some point, the last signal in a chain is created, and the values or errors propogated through the chain can't propogate any further. For values, this is fine, any work requiring the values should have been done by now and they can be discarded. The same isn't true for errors -- if an error has propogated through the chain unhandled, it should not be silently ignored and discarded. For this reason, signal chains need to be ended explicitly with [`.done()`](#done).

If no function is given to `.done()`, it will rethrow unhandled errors using javascript's native `throw`, then kill the last signal in the chain with [`.kill()`](#kill).

```javascript
var s = sig()

s.map(function(v) { return v + 1 })
 .filter(function(x) { return !(x % 2) })
 .each(sig.log)
 .done()

s.put(1)  // 2
 .put(2)
 .put(3)  // 4
 .throw(':/')  // Error: :/
```

`.done()` accepts a node.js-style callback function. If an error reaches the end of the signal chain, the callback function is called with the error as its first argument, then the last signal in the chain is killed using [`.kill()`](#kill).

```javascript
var s = sig()

s.map(function(v) { return v + 1 })
 .filter(function(x) { return !(x % 2) })
 .each(sig.log)
 .done(function(e) { sig.log(e || 'done!') })

s.put(1)  // 2
 .put(2)
 .put(3)  // 4
 .throw(':/')  // :/
 .put(4)
 .put(5)
```

If a signal in the chain has ended, the callback function is invoked without any arguments.

```javascript
var s = sig()

s.map(function(v) { return v + 1 })
 .filter(function(x) { return !(x % 2) })
 .each(sig.log)
 .done(function(e) { sig.log(e || 'done!') })

s.put(1)  // 2
 .put(2)
 .put(3)  // 4
 .end()  // done!
```

If any values propogate to the end of the signal chain, [`.done()`](#done) will discard them.

```javascript
// nothing will get logged, `.done()` has discarded the values
sig([1, 2, 3])
  .done()
  .each(sig.log)
```


<a name="disposal"></a>
### disposal

When a signal is no longer needed, [`.end()`](#end) should be used. Ending a signal causes the signal to end each of its targets (and in turn, each target will end their own targets) and [disconnects](#disconnects) the signal from its source. Once the signal no longer has buffered values that it needs to send, its [teardowns](#teardown) are called, its state is cleared and it is marked as ended. Signals marked as ended treat [`.put()`](#put), [`.throw()`](#throw) and [`.then()`](#then-fn) as no-ops. The immediate disconnecting of a signal is necessary to avoid memory leaks caused by signals with buffers that never clear.

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.teardown(sig.log, 'ended')
 .pause()
 .put(23)
 .end()

s.resume()
// 23
// ended
```

If the signal needs to be ended immediately, regardless of whether it still has values it needs to send, [`kill`](#kill) should be used.

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.teardown(sig.log, 'ended')
 .pause()
 .put(23)
 .kill()  // ended
```

Note that creating signals without ending them when their work is done will lead to memory leaks for the same reasons not removing event listeners will when using an event listener pattern.

<a name="disconnects"></a>
### disconnects

When a signal is ended, the chain of signals ending with it (if any) will no longer be sending values to it, so it can be removed from the chain. However, other signals in the chain cannot be ended, as sibling targets (targets with the same source) might still be around listening for new values. To prevent chains of unused target signals being kept in memory as a result of this, source signals forget a target signal when the target no longer has its own targets, putting the target in a 'disconnected' state. Targets keep a reference to their source, so a signal chain will be reconnected if a new target gets added at the end of the chain.

```javascript
var a = sig()
var b = sig()
var c = sig()
var d = sig()
var e = sig()

a.then(b)
b.then(c).done()
b.then(d).done()
//       a
//       |
//       v
//  ---- b      
// |     |
// v     v
// c     d     e

c.end()
//       a
//       |
//       v
//       b      
//       |
//       v
// c     d     e

d.end()
//       a
//        
//        
//       b      
//        
//        
// c     d     e

b.then(e).done()
//       a
//       |
//       v
//       b ----
//             |
//             v
// c     d     e
```

### pausing and resuming

When a signal is paused using [`pause`](#pause), any values given to it by [`put`](#put) are buffered. When the signal is resumed using [`resume`](#resume), any buffered values are sent to the signal's targets, and any new values will be sent straight to the signal's targets (and not get buffered).
 
```javascript
var s = sig()

s.each(sig.log)
 .done()

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
sig()
  .put(21)
  .put(23)
  .each(sig.log)
  .done()

// 21
// 23
```

A signal can be set to non-eager by setting the signal's `eager` property to `false`.

```javascript
var s = sig()
s.eager = false
```

### redirection

Sometimes, a function will return a single signal, though it has created one or more signal chains to send values to the returned signal.

Redirecting using [`.put()`](#put) from a different signal's value handling function will cause the signal to continue running indefinitely instead of disconnecting with its targets:

```javascript
function join(a, b) {
  var out = sig()
  var badRedirA = a.each(badRedir)
  var badRedirB = b.each(badRedir)

  function badRedir(v) {
    out.put(v)
    this.next()
  }

  return out
}


var a = sig()
var b = sig()
var out = join(a, b)
var logOut = out.each(sig.log)
logOut.done()

// single line for targets, double line for redirections
//
//   a                      b
//   |                      |
//   v                      v
// badRedirA ==> out <== badRedirB
//                |
//                v
//             logOut

a.put(21)  // 21
b.put(23)  // 23

out.end()

// redirA and redirB are still connected :/
//
//   a                  b
//   |                  |
//   v                  v
// redirA ==> out <== redirB
//
//
//          logOut
```

To redirect without this unwanted behaviour, [`.redir()`](#redir) should be used to redir values and errors to the returned signal, and to set these chains to disconnect when the returned signal is disconnected.

If a function creates a signal chain, but the chain isn't returned, redirected or ended, this will lead to memory leaks. Rule of thumb: If you have a signal that outputs values, either return the signal, or redirect it to another returned signal.

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
var logOut = out.each(sig.log)
logOut.done()

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

out.end()

// redirA and redirB are disconnected!
//
//   a                  b
//                      
//                      
// redirA     out     redirB
//              
//              
//          logOut
```

<a name="sticky"></a>
### sticky signals

Sometimes, a signal needs to hold onto the last value it has sent out. When new targets arrive, they need to receive this last value instead of having them 'miss the bus' and only receive new values sent from the source signal. Sticky signals allow this.

Sticky signals can be created using [`val`](#val).

```javascript
var v = sig.val(23)
v.each(sig.log)  // 23
v.each(sig.log)  // 23
```

## api

<a name="sig"></a>
#### `sig([values])`

Creates a new signal. If a `values` array is given, it is used as the initial values sent from the signal.

```javascript
var s = sig([1, 2, 3])
```


### functions and methods

The following sig methods are also accessible as static functions taking a signal as the first argument:

`put`, `then`, `done`, `next`, `end`, `kill`, `resolve`, `putEach`, `throw`, `catch`, `teardown`, `pause`, `resume`, `map`, `each`, `tap`, `filter`, `flatten`, `limit`, `once`, `then`, `redir`, `update`, `append`, `call`

For example, using the static counterpart of [`.put`](#put) would look something like:

```javascript
var s = sig()

s.each(sig.log)
 .done()

sig.put(s, 21)  // 21
sig.put(s, 23)  // 23
```


<a name="put"></a>
### `.put([v])`

Puts the value `v` through the signal, where `v` can be a value of any type.

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.put(21)  // 21
 .put(21)  // 23
```


<a name="next"></a>
### `.next()`

Tells the calling signal that it is done processing its most recent value or error, if any, and is ready to processing the next value or error.

```javascript
var s = sig()
var t = s.then(sig.log)
t.done()

s.put(1)  // 1
 .put(2)

t.next()  // 2
```


<a name="throw"></a>
### `.throw(e)`

Propogates the error instance `e` from the signal.

```javascript
var s = sig()

s.catch(sig.log)
 .done()

s.throw(new Error('o_O'))  // o_O
```


<a name="end"></a>
### `.end()`

Ends the given signal, causing it to end its target signals and disconnect from its source, then clear its state once the signal no longer has values to send. See [disposal](#disposal).

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.put(21)  // 21
 .end()
 .put(23)
```

<a name="kill"></a>
### `.kill()`

Ends the given signal immediately, regardless of whether the signal still has values it needs to send. See [disposal](#disposal).

```javascript
sig([1, 2, 3])
  .teardown(sig.log, 'Ended')
  .end()
  .kill()  // Ended
```

<a name="then-fn"></a>
### `.then(fn[, args...])`

Creates and returns a new target signal with `fn` as its value handler. `fn` is called with each received value as its first argument and the created signal as its `this` context. The target signal is returned to allow for further signal chaining.

```javascript
var s = sig()

s.then(function(v) { this.put(v + 2).next() })
 .each(sig.log)
 .done()

s.put(21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.then(function(a, b, c) { this.put(a + b + c).next() }, 1, 2)
 .each(sig.log)
 .done()

s.put(20)  // 23
```


<a name="then-s"></a>
### `.then(t)`

Sets the calling signal as the source of the signal `t` and returns `t`.  

```javascript
var s = sig()
var t = s.then(sig())

t.each(sig.log)
 .done()

s.put(23)  // 23
```


<a name="done"></a>
### `.done([fn])`

Ends a chain of signals (see [ending chains](#ending-chains)). If an unhandled error reaches the end of the signal chain `fn` will be called with the error as its first argument and the last signal in the chain will be [killed](#kill). If the signal ends without any errors `fn` will be called with no arguments. If `fn` isn't given, the first unhandled error will be rethrown using javascript's native `throw`.

```javascript
var s = sig()

s.map(function(v) { return v + 1 })
 .filter(function(x) { return !(x % 2) })
 .each(sig.log)
 .done(function(e) { sig.log(e || 'done!') })

s.put(1)  // 2
 .put(2)
 .put(3)  // 4
 .throw(':/')  // :/
 .put(4)
 .put(5)
```

 
<a name="resume"></a>
### `.resume()`

Resumes the signal, causing the buffered values to propagate to the signal's targets and causing any new values to be sent to the signal's targets.
 
```javascript
var s = sig()

s.each(sig.log)
 .done()
 
s.put(21)  // 21
 .pause()
 .put(23)
 .resume()  // 23
```


<a name="catch"></a>
### `.catch(fn[, args...])`

Creates and returns a new target signal with `fn` set as its error handler. `fn` is called with each thrown error as its first argument and the created signal as its `this` context. The created signal is returned to allow for further signal chaining.

```javascript
var s = sig()

s.catch(function(e) {
   sig.log(e)
   this.next()
 })
 .done()

s.throw(new Error('o_O'))  // o_O
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.catch(function(a, b, c) {
   sig.log(a, b, c)
   this.next()
 })
 .done()

s.throw(new Error('o_O'), '-_-', ':/')  // o_O -_- :/
```


<a name="each"></a>
### `.each(fn[, args...])`

Creates and returns a new target signal with a value handler that calls `fn`, then calls [`.next()`](#next) immediately afterwards. This is useful for synchronous signals, where the value handler will almost always end with `.next()`. The target signal is returned to allow for further signal chaining. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.each(function(v) { this.put(v + 2) })
 .each(sig.log)
 .done()

s.put(21)  // 23
```

Note that if the handler is doing asynchronous work, it would make more sense to use [`.then`](#then-fn), then call `.next()` when the asynchronous work completes.

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.each(function(a, b, c) { this.put(a + b + c) }, 1, 2)
 .each(sig.log)
 .done()

s.put(20)  // 23
```

Since `.each()` is intended for use with synchronous functions, if `fn` throws an error using javascript's native `throw`, the error will be caught and as an error in the signal chain.


<a name="tap-fn"></a>
### `.tap(fn[, args...])`

Creates and returns a new target signal with a value handler that calls `fn`, then propogates the received value unchanged, allowing a function to 'tap' into a signal chain.

```javascript
var s = sig()

s.map(function(v) { return v + 1 })
 .tap(sig.log)
 .filter(function(v) { return !(v % 2) })
 .done()

s.put(21)  // 22
 .put(22)  // 23
 .put(23)  // 24
```


<a name="map-fn"></a>
### `.map(fn[, args...])`

Creates and returns a new target signal with a value handler that calls `fn` and outputs its return value. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.map(function(v) { return v + 2 })
 .each(sig.log)
 .done()

s.put(21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.map(function(a, b, c) { this.put(a + b + c) }, 1, 2)
 .each(sig.log)
 .done()

s.put(20)  // 23
```


<a name="map-v"></a>
### `.map(v)`

Creates and returns a new signal with a value handler that simply outputs `v` for every value received by the signal. The created signal uses `s` as its source signal. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.map(function(v) { return v + 2 })
 .each(sig.log)
 .done()

s.put(21)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.map(function(a, b, c) { this.put(a + b + c) }, 1, 2)
 .each(sig.log)
 .done()

s.put(20)  // 23
```


<a name="filter"></a>
### `.filter([fn[, args...]])`

Creates and returns a new taret signal with a value handler that calls `fn` to determine whether to output a recieved value. `fn` is called with each received value as its first argument and the created signal as its `this` context.

```javascript
var s = sig()

s.filter(function(v) { return v % 2 })
 .each(sig.log)
 .done()

s.put(22)
 .put(23)  // 23
```

If extra arguments are provided, they are used as extra arguments to each call to `fn`.

```javascript
var s = sig()

s.filter(function(a, b, c) { return (a + b + c) % 2 }, 1, 2)
 .each(sig.log)
 .done()

s.put(22)  // 22
 .put(23)
```

If `fn` isn't provided, an identity function is used, filtering values based on their truthyness.

```javascript
var s = sig()

s.filter()
 .each(sig.log)
 .done()

s.put(0)
 .put(1)  // 1
```


<a name="redir"></a>
### `.redir(t)`

Redirects values and errors sent from the calling signal to signal `t`. The returned signal is a new signal that controls this redirection. When either it, `s` or `t` are ended, the redirection ends. `redir` behaves differently to `then`, as it does not set the calling signal as the source of `t`.

```javascript
function join(a, b) {
  var out = sig()
  a.redir(out)
  b.redir(out)
  return out
}


var a = sig()
var b = sig()

join(a, b)
  .each(sig.log)
  .done()

a.put(21)  // 21
b.put(23)  // 23
```


<a name="tap-t"></a>
### `.tap(t)`

Redirects values propagated by the calling signal to another signal `t` and returns a new signal that propagates the source signal's values unchanged. This allows a signal to 'tap' into another signal chain. 

```javascript
var s = sig()
var t = sig()

t.each(sig.log)
 .done()

s.map(function(v) { return v + 1 })
 .tap(t)
 .filter(function(v) { return !(v % 2) })
 .done()

s.put(21)  // 22
 .put(22)  // 23
 .put(23)  // 24
```

Redirection will stop when `t` disconnects, when the returned signal disconnects or when the source signal disconnects. When `t` disconnects, the returned signal will continue to propagate the source signal's values.


<a name="flatten"></a>
### `.flatten()`

Creates and returns a new target signal that outputs each non-array value in a series of possibly nested arrays.

```javascript
var s = sig()

s.flatten()
 .each(sig.log)
 .done()

s.putEach([1, [2, [3, [4, 5, [6, 7, 8, [9, [10]]]]]]])
// [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
```


<a name="limit"></a>
### `.limit(n)`

Creates and returns a new target signal that only propogates the first `n` values it receives.

```javascript
var s = sig()

s.limit(3)
 .each(sig.log)
 .done()

s.put(21)  // 21
 .put(22)  // 22
 .put(23)  // 23
 .put(24)
 .put(25)
```


<a name="once"></a>
### `.once()`

Special case of `limit` where `n === 1`.

```javascript
var s = sig()

s.once()
 .each(sig.log)
 .done()

s.put(21)  // 21
 .put(22)
 .put(23)
```


<a name="update"></a>
### `.update(fn[, args...])`

Returns a new target signal that 'updates' to proxy the signal most recently generated by a function `fn` mapping the calling signal's output values.

```javascript
var s = sig()

var lookup = {
  t: sig()
  u: sig()
}

s.update(function(k) { return lookup[k] })
 .each(sig.log)
 .done()

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
 .each(sig.log)
 .done()

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


<a name="append"></a>
### `.append(fn[, args...])`

Returns a new target signal that proxies every signal generated by a function `fn` mapping the calling signal's output values. Each time a new signal is generated, it is 'appended' to the signals being tracked, so outputs of previous signals will still be proxied when a new signal is generated by `fn`.

```javascript
var s = sig()

var lookup = {
  t: sig()
  u: sig()
}

s.append(function(k) { return lookup[k] })
 .each(sig.log)
 .done()

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
 .each(sig.log)
 .done()

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


<a name="call"></a>
### `.call(fn[, args...])`

Calls a function `fn` with the calling signal as its first argument and `args` as the remaining arguments. Useful for hooking custom functions into a signal chain.

```
var s = sig()

s.call(mul, 2)
 .each(sig.log)
 .done()

s.putEach([1, 2, 3])
// [2, 4, 6]


function mul(s, n) {
  return s.map(function(v) { return v * n })
}
```


<a name="teardown"></a>
### `.teardown(fn[, args...])`

Schedules `fn` to be called when the calling signal has ended. `fn` is called with the calling signal as its `this` context. Any state used by the signal should be deconstructed inside a teardown function. If the calling signal has already ended, `fn` is called immediately. See [disposal](#disposal).

```javascript
function tick() {
  var s = sig()
  var id = setInterval(resolve, 200, s)

  s.teardown(function() {
    clearInterval(id)
  })

  return s
}

var s = tick()

s.each(sig.log)
 .done()

// this will cause the teardown function to get called
s.end()
```

<a name="resolve"></a>
### `.resolve([v])`

Sends the value `v` (or `undefined` if no value is given) from the calling signal, then ends the signal.

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.resolve(21)  // 21
 .put(23)
```


<a name="putEach"></a>
### `.putEach()`

Sends each value in a `values` array from the calling signal.

```javascript
var s = sig()

s.each(sig.log)
 .done()

s.putEach([1, 2, 3])
// 1
// 2
// 3
```


<a name="to"></a>
### `.to(t)`

Sends the signal as a value to signal `t`.

```javascript
var s = sig()

s.update()
 .each(sig.log)
 .done()

var t = sig()
t.to(s)

t.put(23)  // 23
```


<a name="val"></a>
### `sig.val([v])`

Creates and returns a new [sticky](#sticky) signal. If `v` is given, it is used as the initial value for the created signal.

```javascript
var v = sig.val(23)
v.each(sig.log).done()  // 23
v.each(sig.log).done()  // 23
```


<a name="ensure-val"></a>
### `sig.ensureVal(v)`

If a `v` is given, a sticky signal is returned with `v` as its initial value. If `v` is a signal, a new sticky signal is returned with `v` as its source.

```javascript
var v = sig.ensureVal(23)
v.each(sig.log).done()  // 23

var s = sig()
var t = sig.ensureVal(s)

s.put(23)
t.each(sig.log).done()  // 23
t.each(sig.log).done()  // 23
```


<a name="any-values"></a>
### `sig.any(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array containing the value and its corresponding signal's index in the array whenever one of the signals in the array changes.

```javascript
var s = sig()
var t = sig()

sig.any([s, 23, t])
  .each(sig.spread, sig.log)
  .done()

s.put(1)  // 1 0
t.put(3)  // 3 2
s.put(2)  // 2 0
t.put(1)  // 1 2
s.put(3)  // 3 0
```


<a name="any-obj"></a>
### `sig.any(obj)`

Identical to [`sig.any(values)`](#any-values), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal are arrays, each containing the given value and its corresponding signal's key in the object.

```javascript
var s = sig()
var t = sig()

sig.any({
    a: s,
    b: 23,
    c: t
  })
  .each(sig.spread, sig.log)
  .done()

s.put(1)  // 1 a
t.put(3)  // 3 c
s.put(2)  // 2 a
t.put(1)  // 1 c
s.put(3)  // 3 a
```



<a name="all-values"></a>
### `sig.all(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs an array of the current values of each signal and non-signal each time one of the values changes. Note that the returned signal will only start outputting once each signal in the array has put through its first value.

```javascript
var s = sig()
var t = sig()

sig.all([s, 23, t])
  .each(sig.log)
  .done()

s.put(1)
t.put(3)  // [1, 23, 3]
s.put(2)  // [2, 23, 3]
t.put(1)  // [2, 23, 1]
s.put(3)  // [3, 23, 1]
```


<a name="all-obj"></a>
### `sig.all(obj)`

Identical to [`sig.all(values)`](#all-values), catch it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal.

```javascript
var s = sig()
var t = sig()

sig.all({
    a: s,
    b: 23,
    c: t
  })
  .each(sig.log)
  .done()

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


<a name="merge-values"></a>
### `sig.merge(values)`

Accepts an array of `values`, where each value can be either a signal or non-signal, and returns a signal that outputs the values put through each signal in the array.

```javascript
var s = sig()
var t = sig()

sig.merge([s, 23, t])
  .each(sig.log)
  .done()

s.put(1)  // 1
t.put(3)  // 3
s.put(2)  // 2
t.put(1)  // 1
s.put(3)  // 3
```

<a name="merge-obj"></a>
### `sig.merge(obj)`


Identical to [`sig.merge(values)`](#merge-values), except it handles an object of key-value pairs instead of an array, where each value can be either a signal or non-signal. The values outputted from the signal are the values sent from each signal in the object.

```javascript
var s = sig()
var t = sig()

sig.merge({
    a: s,
    b: 23,
    c: t
  })
  .each(sig.log)
  .done()

s.put(1)  // 1
t.put(3)  // 3
s.put(2)  // 2
t.put(1)  // 1
s.put(3)  // 3
```


<a name="isSig"></a>
### `sig.isSig(v)`

Returns `true` if `v` is a signal, `false` if it is not.

```javascript
sig.isSig(23)  // => false
sig.isSig(sig())  // => true
```


<a name="log"></a>
### `sig.log(v)`

Logs the given arguments. Similar to `console.log`, except it does not rely on `console` as its `this` context and returns its first argument.

```javascript
var s = sig()

s.filter()
 .map(sig.log)
 .map(function(v) { return v * 2 })
 .each(sig.log)
 .done()

s.putEach([0, 1, 1, 0])
// 1
// 1
// 2
// 2
```


<a name="to-static"></a>
### `sig.to(v, s)`

The static form of [`.to()`](#to), except `v` can be a value of any time (it does not have to be a signal).
