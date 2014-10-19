;(function() {
  sig.reset = reset
  sig.push = push
  sig.receive = receive
  sig.watch = watch
  sig.unwatch = unwatch
  sig.pause = pause
  sig.resume = resume
  sig.map = map
  sig.filter = filter
  sig.limit = limit
  sig.once = once
  sig.then = then
  sig.isSig = isSig
  sig.spread = spread
  sig.depend = depend
  sig.undepend = undepend


  function sig(receiver) {
    return {
      type: 'sig',
      paused: true,
      buffer: [],
      sources: [],
      targets: [],
      dependants: [],
      receiver: receiver || noop
    }
  }


  function reset(s) {
    s.sources.forEach(function(source) { untarget(s, source) })
    s.targets.forEach(function(target) { unsource(target, s) })
    s.dependants.forEach(reset)
    s.sources = []
    s.targets = []
    s.dependants = []
    return s
  }


  function watch(t, s) {
    unwatch(t, s)
    s.targets.push(t)
    t.sources.push(s)
    return t
  }


  function depend(t, s) {
    undepend(t, s)
    s.dependants.push(t)
    return t
  }


  function undepend(t, s) {
    rm(s.dependants, t)
    return t
  }


  function untarget(t, s) {
    rm(s.targets, t)
    return t
  }


  function unsource(t, s) {
    rm(t.sources, s)
    return t
  }


  function unwatch(t, s) {
    unsource(t, s)
    untarget(t, s)
    return t
  }


  function push(s, x) {
    if (s.paused) return buffer(s, x)

    return s.paused
      ? buffer(s, x)
      : send(s, x)
  }


  function receive(s, x) {
    s.receiver(x, s)
    return s
  }


  function pause(s) {
    s.paused = true
  }


  function resume(s) {
    s.paused = false
    flush(s)
  }


  function flush(s) {
    var buffer = s.buffer
    var i = -1
    var n = buffer.length
    while (++i < n) send(s, buffer[i])
    s.buffer = []
  }


  function send(s, x) {
    var targets = s.targets
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], x)
    return s
  }


  function buffer(s, x) {
    s.buffer.push(x)
    return s
  }


  function map(s, fn) {
    var t = sig(mapper(fn))
    watch(t, s)
    resume(s)
    return t
  }


  function filter(s, fn) {
    var t = sig(filterer(fn))
    watch(t, s)
    resume(s)
    return t
  }


  function limit(s, n) {
    var t = sig(limiter(n))
    watch(t, s)
    resume(s)
    return t
  }


  function once(s) {
    return limit(s, 1)
  }


  function then(s, fn) {
    return map(once(s), fn)
  }


  function isSig(s) {
    return (s || 0).type == 'sig'
  }


  function spread(fn) {
    return function(values) {
      var args = arguments.length > 1
        ? values.concat(Array.prototype.slice.call(arguments, 1))
        : values
      return fn.apply(fn, args)
    }
  }


  function mapper(fn) {
    return function(x, t) {
      push(t, fn(x, t))
    }
  }


  function filterer(fn) {
    return function(x, t) {
      if (fn(x, t)) push(t, x)
    }
  }


  function limiter(n) {
    i = 0

    return function(x, t) {
      if (++i > n) reset(t)
      else push(t, x)
    }
  }


  function rm(arr, x) {
    var i = arr.indexOf(x)
    if (i < 0) return
    arr.splice(i, 1)
  }


  function noop() {}


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
