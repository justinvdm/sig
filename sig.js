;(function() {
  sig.reset = reset
  sig.push = push
  sig.receive = receive
  sig.watch = watch
  sig.unwatch = unwatch
  sig.map = map
  sig.filter = filter
  sig.limit = limit
  sig.once = once
  sig.isSig = isSig
  sig.spread = spread
  sig.depend = depend
  sig.undepend = undepend


  function sig(receiver) {
    return {
      type: 'sig',
      sources: [],
      targets: [],
      dependants: [],
      receiver: receiver || noop
    }
  }


  function reset(s) {
    s.sources.forEach(function(source) { untarget(source, s) })
    s.targets.forEach(function(target) { unsource(s, target) })
    s.dependants.forEach(function(dependant) { reset(dependant) })
    s.sources = []
    s.targets = []
    s.dependants = []
    return s
  }


  function watch(s, t) {
    s.targets.push(t)
    t.sources.push(s)
    return s
  }


  function depend(s, t) {
    s.dependants.push(t)
  }

  function undepend(s, t) {
    rm(s.dependants, t)
  }


  function untarget(s, t) {
    rm(s.targets, t)
  }


  function unsource(s, t) {
    rm(t.sources, s)
  }


  function unwatch(s, t) {
    unsource(s, t)
    untarget(s, t)
    return s
  }


  function push(s, x) {
    var targets = s.targets
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], x)
    return s
  }


  function receive(s, x) {
    s.receiver(x, s)
    return s
  }


  function map(s, fn) {
    var t = sig(mapper(fn))
    watch(s, t)
    return t
  }


  function filter(s, fn) {
    var t = sig(filterer(fn))
    watch(s, t)
    return t
  }


  function limit(s, n) {
    var t = sig(limiter(n))
    watch(s, t)
    return t
  }


  function once(s) {
    return limit(s, 1)
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
