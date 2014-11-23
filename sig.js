;(function() {
  var nil = {}

  isArray = Array.isArray

  sig.reset = reset
  sig.put = put
  sig.putMany = putMany
  sig.resolve = resolve
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
  sig.depend = depend
  sig.undepend = undepend
  sig.isSig = isSig
  sig.nil = nil
  sig.sticky = sticky


  function sig(obj) {
    if (isSig(obj)) return obj

    var s = resetProps({
      type: 'sig',
      sticky: false,
      receiver: identityReceiver,
      errorHandler: thrower
    })

    if (arguments.length) initialPut(s, obj)
    return s
  }


  function resetProps(s) {
    s.paused = true
    s.current = nil
    s.sources = []
    s.targets = []
    s.buffer = []
    s.dependants = []
    s.cleanups = []
    return s
  }


  function initialPut(s, obj) {
    if (isArray(obj)) putMany(s, obj)
    else put(s, obj)
    return s
  }


  function identityReceiver(x, t) {
    put(t, x)
  }


  function reset(s) {
    s.cleanups.forEach(invoke)
    s.sources.forEach(function(source) { untarget(s, source) })
    s.targets.forEach(function(target) { unsource(target, s) })
    s.dependants.forEach(reset)
    resetProps(s)
    return s
  }


  function watch(t, s) {
    var current

    unwatch(t, s)
    s.targets.push(t)
    t.sources.push(s)

    if (s.sticky) {
      current = s.current
      if (current !== nil) receive(t, current)
    }

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


  function put(s, x) {
    if (s.sticky) s.current = x
    if (s.paused) buffer(s, x)
    else send(s, x)
    return s
  }


  function putMany(s, values) {
    var n = values.length
    var i = -1
    while (++i < n) put(s, values[i])
    return s
  }


  function resolve(s) {
    put(s, null)
    return s
  }


  function receive(s, x) {
    try { s.receiver(x, s) }
    catch (e) { raise(s, e) }
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


  function raise(s, e) {
    try { s.errorHandler(e, s) }
    catch (e2) { propogateError(s, e2) }
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


  function map(s, fn) {
    var t = sig()
    var args = slice(arguments, 2)

    t.receiver = function(x, t) {
      put(t, fn.apply(t, [x].concat(args)))
    }

    watch(t, s)
    resume(s)
    return t
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


  function then(s) {
    s = once(s)
    return map.apply(null, arguments)
  }


  function ensure(v) {
    return !isSig(v)
      ? sig([v])
      : v
  }


  function any(values) {
    var out = sig()

    each(values, function(s, k) {
      if (!isSig(s)) return
      depend(map(s, puts(k)), out)
    })

    function puts(k) {
      return function(x, t) {
        put(out, [x, k])
      }
    }

    return out
  }


  function all(values) {
    var out = sig()
    var remaining = {}
    values = copy(values)

    each(values, function(s, k) {
      if (!isSig(s)) return
      remaining[k] = true
    })

    if (isEmpty(remaining)) put(out, values)
    else each(values, watcher)

    function watcher(s, k) {
      if (!isSig(s)) return
      depend(map(s, puts(k)), out)
    }

    function puts(k) {
      return function(x, t) {
        delete remaining[k]
        values[k] = x
        if (isEmpty(remaining)) put(out, copy(values))
      }
    }

    return out
  }


  function sticky(obj) {
    var s = sig()
    s.sticky = true
    if (arguments.length) initialPut(s, obj)
    return s
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
    if (Array.isArray(obj)) return slice(obj)
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


  function invoke(fn) {
    fn()
  }


  function thrower(e) {
    throw e
  }


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
