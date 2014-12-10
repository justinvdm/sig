;(function() {
  var nil = {}

  isArray = Array.isArray

  sig.reset = reset
  sig.put = put
  sig.putMany = putMany
  sig.receive = receive
  sig.watch = watch
  sig.unwatch = unwatch
  sig.pause = pause
  sig.resume = resume
  sig.cleanup = cleanup
  sig.raise = raise
  sig.except = except
  sig.map = map
  sig.filter = filter
  sig.limit = limit
  sig.once = once
  sig.then = then
  sig.ensure = ensure
  sig.any = any
  sig.all = all
  sig.spread = spread
  sig.isSig = isSig
  sig.nil = nil


  function sig(obj) {
    if (isSig(obj)) return obj

    var s = resetProps({
      type: 'sig',
      targets: [],
      sources: [],
      receiver: put,
      errorHandler: raise
    })

    if (arguments.length) initialPut(s, obj)
    return s
  }


  function resetProps(s) {
    s.paused = false
    s.current = nil
    s.buffer = []
    s.cleanups = []
    s.error = null
    return s
  }


  function initialPut(s, obj) {
    if (isArray(obj)) putMany(s, obj)
    else put(s, obj)
    return s
  }


  function reset(s) {
    runCleanups(s)
    resetTargets(s)
    resetSources(s)
    resetProps(s)
    return s
  }


  function resetTargets(s) {
    var i = -1
    var targets = s.targets
    var n = targets.length
    var t

    while (++i < n) {
      t = targets[i]
      rmSource(t, s)
      if (t.targets.length && !t.sources.length) resetTargets(t)
    }

    s.targets = []
    return s
  }


  function resetSources(t) {
    var i = -1
    var sources = t.sources
    var n = sources.length
    var s

    while (++i < n) {
      s = sources[i]
      rmTarget(s, t)
      if (s.sources.length && !s.targets.length) resetSources(s)
    }

    return t
  }


  function addTarget(s, t) {
    rmTarget(s, t)
    s.targets.push(t)
    return s
  }


  function rmTarget(s, t) {
    rm(s.targets, t)
    return s
  }


  function addSource(t, s) {
    rmSource(t, s)
    t.sources.push(s)
    return t
  }


  function rmSource(t, s) {
    rm(t.sources, s)
    return t
  }


  function refreshSources(t) {
    var i = -1
    var sources = t.sources
    var n = sources.length
    var s

    while (++i < n) {
      s = sources[i]
      addTarget(s, t)
      refreshSources(s)
    }

    return t
  }


  function watch(t, s) {
    addSource(t, s)
    addTarget(s, t)
    refreshSources(s)
    return t
  }


  function unwatch(t, s) {
    rmSource(t, s)
    rmTarget(s, t)
    return t
  }


  function put(s) {
    var d = slice(arguments, 1)
    if (s.paused) buffer(s, d)
    else send(s, d)
    return s
  }


  function putMany(s, values) {
    var n = values.length
    var i = -1
    while (++i < n) put(s, values[i])
    return s
  }


  function receive(s, d) {
    s.receiver.apply(s, [s].concat(d))
    return s
  }


  function pause(s) {
    s.paused = true
    return s
  }


  function resume(s) {
    s.paused = false
    flush(s)
    return s
  }


  function cleanup(s, fn) {
    s.cleanups.push(fn)
    return s
  }


  function runCleanups(s) {
    var cleanups = s.cleanups
    var n = cleanups.length
    var i = -1
    while (++i < n) cleanups[i].call(s, s)
    return s
  }


  function raise(s, e) {
    return !s.error
      ? handleError(s, e)
      : propogateError(s, e)
  }


  function handleError(s, e) {
    s.error = e
    s.errorHandler(s, e)
    s.error = null
    return s
  }


  function propogateError(s, e) {
    var targets = s.targets
    var n = targets.length
    if (!n) throw e

    var i = -1
    while (++i < n) raise(targets[i], e)
    return s
  }


  function except(s, fn) {
    var t = sig()
    t.errorHandler = fn
    watch(t, s)
    return t
  }


  function flush(s) {
    var buffer = s.buffer
    var i = -1
    var n = buffer.length
    while (++i < n) send(s, buffer[i])
    s.buffer = []
    return s
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


  function then(s, obj) {
    return typeof obj == 'function'
      ? thenFn(s, obj)
      : thenSig(s, obj)
  }


  function thenFn(s, fn) {
    var t = sig()
    t.receiver = fn
    return thenSig(s, t)
  }


  function thenSig(s, t) {
    watch(t, s)
    return t
  }


  function map(s, fn) {
    var args = slice(arguments, 2)

    return then(s, function(t, x) {
      put(t, fn.apply(t, [x].concat(args)))
    })
  }


  function filter(s, fn) {
    var t = sig()
    var args = slice(arguments, 2)
      
    t.receiver = function(x, t) {
      if (fn.apply(t, [x].concat(args))) put(t, x)
    }

    watch(t, s)
    resume(s)
    return t
  }


  function limit(s, n) {
    var i = 0
    var t = sig()
    
    t.receiver = function(x, t) {
      if (++i > n) unwatch(t, s)
      else put(t, x)
    }

    watch(t, s)
    resume(s)
    return t
  }


  function once(s) {
    return limit(s, 1)
  }


  function ensure(v) {
    return !isSig(v)
      ? sig([v])
      : v
  }


  function any(values, fn) {
    return sig(function() {
      var out = sig()
      if (isArguments(values)) values = slice(values)

      each(values, function(s, k) {
        if (!isSig(s)) return
        map(s, puts, k)
      })

      function puts(x, k) {
        put(out, [x, k])
      }

      return fn
        ? map(out, spread(fn))
        : out
    })
  }


  function all(values, fn) {
    return sig(function() {
      var out = sig()
      var remaining = {}
      var isArgs = isArguments(values)
      values = copy(values)

      each(values, function(s, k) {
        if (!isSig(s)) return
        remaining[k] = true
      })

      if (isEmpty(remaining)) put(out, values)
      else each(values, watcher)

      function watcher(s, k) {
        if (!isSig(s)) return
        map(s, puts, k)
      }

      function puts(x, k) {
        delete remaining[k]
        values[k] = x
        if (isEmpty(remaining)) put(out, copy(values))
      }

      if (!fn) return out
      return isArgs
        ? map(out, spread(fn))
        : map(out, fn)
    })
  }


  function isSig(s) {
    return (s || 0).type == 'sig'
  }


  function spread(fn) {
    return function(values) {
      return fn.apply(fn, values.concat(slice(arguments, 1)))
    }
  }


  function each(obj, fn) {
    if (Array.isArray(obj)) return obj.forEach(fn)
    for (var k in obj) if (obj.hasOwnProperty(k)) fn(obj[k], k)
  }


  function isEmpty(obj) {
    var k
    for (k in obj) return false
    return true
  }


  function copy(obj) {
    if (isArray(obj) || isArguments(obj)) return slice(obj)
    var result = {}
    for (var k in obj) if (obj.hasOwnProperty(k)) result[k] = obj[k]
    return result
  }


  function rm(arr, x) {
    var i = arr.indexOf(x)
    if (i < 0) return
    arr.splice(i, 1)
  }


  var _slice = Array.prototype.slice

  function slice(arr, a, b) {
    return _slice.call(arr, a, b)
  }


  function isArguments( obj ) {
    return typeof obj == 'object'
        && typeof obj.length == 'number'
        && 'callee' in obj
  }


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
