;(function() {
  var nil = {}

  var isArray = Array.isArray
  var _slice = Array.prototype.slice
  var _log = console.log

  sig.reset = reset
  sig.disconnect = disconnect
  sig.reconnect = reconnect
  sig.put = put
  sig.to = to
  sig.resolve = resolve
  sig.putMany = putMany
  sig.receive = receive
  sig.source = source
  sig.unsource = unsource
  sig.pause = pause
  sig.resume = resume
  sig.raise = raise
  sig.except = except
  sig.setup = setup
  sig.teardown = teardown
  sig.map = map
  sig.filter = filter
  sig.flatten = flatten
  sig.limit = limit
  sig.once = once
  sig.then = then
  sig.ensure = ensure
  sig.any = any
  sig.all = all
  sig.merge = merge
  sig.spread = spread
  sig.isSig = isSig
  sig.nil = nil
  sig.val = val
  sig.ensureVal = ensureVal
  sig.redir = redir
  sig.log = log
  sig.update = update
  sig.append = append


  function sig(obj) {
    if (isSig(obj)) return obj

    var s = resetProps({
      targets: [],
      source: null,
      type: 'sig',
      eager: true,
      sticky: false,
      receiver: putReceiver,
      errorHandler: raiseHandler
    })

    if (arguments.length) putMany(s, obj)
    return s
  }


  function putReceiver(x) {
    put(this, x)
  }


  function raiseHandler(e) {
    raise(this, e)
  }


  function resetProps(s) {
    s.paused = true
    s.current = nil
    s.buffer = []
    s.error = null
    s.disconnected = false
    s.eventListeners = {}
    return s
  }


  function reset(s) {
    emit(s, 'reset')
    resetSource(s)
    resetTargets(s)
    resetProps(s)
    return s
  }


  function resetSource(t) {
    disconnect(t)
    unsetSource(t)
    return t
  }


  function resetTargets(s) {
    s.targets.forEach(resetTarget)
    return s
  }


  function resetTarget(t) {
    t.targets.forEach(resetTarget)
    reset(t)
    return t
  }


  function disconnect(t) {
    var s = t.source

    if (s) {
      rmTarget(s, t)
      if (!s.targets.length) disconnect(s)
    }

    t.disconnected = true
    emit(t, 'disconnect')
    return t
  }


  function reconnect(t) {
    var s = t.source

    if (s) {
      rmTarget(s, t)
      addTarget(s, t)
      reconnect(s)
    }

    t.disconnected = false
    emit(t, 'reconnect')

    return t
  }


  function addTarget(s, t) {
    s.targets.push(t)
    return s
  }


  function rmTarget(s, t) {
    rm(s.targets, t)
    return s
  }


  function setSource(t, s) {
    if (t.source) raise(t, new Error(
      "Cannot set signal's source, signal already has a source"))
    else t.source = s
    return t
  }


  function unsetSource(t) {
    t.source = null
    return t
  }


  function source(t, s) {
    var disconnected = s.disconnected
    var firstTarget = !disconnected && !s.targets.length

    setSource(t, s)
    addTarget(s, t)

    if (disconnected) reconnect(s)
    if (s.eager && firstTarget) resume(s)
    else if (s.sticky && s.current !== nil) receive(t, s.current)
    return t
  }


  function unsource(t) {
    resetSource(t)
    return t
  }


  function put(s, x) {
    s.current = x
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


  function receive(s, x) {
    s.receiver.call(s, x)
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


  function raise(s, e) {
    return !s.error
      ? handleError(s, e)
      : propogateError(s, e)
  }


  function handleError(s, e) {
    s.error = e
    try { s.errorHandler.call(s, e) }
    finally { s.error = null }
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
    t.errorHandler = prime(slice(arguments, 2), fn)
    source(t, s)
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
      ? thenFn.apply(this, arguments)
      : thenSig.apply(this, arguments)
  }


  function thenFn(s, fn) {
    var t = sig()
    t.receiver = prime(slice(arguments, 2), fn)
    return thenSig(s, t)
  }


  function thenSig(s, t) {
    source(t, s)
    return t
  }


  function on(s, event, fn) {
    var listeners = s.eventListeners[event] || []
    s.eventListeners[event] = listeners
    listeners.push(fn)
    return s
  }


  function emit(s, event) {
    var args = slice(arguments, 2)
    var listeners = s.eventListeners[event] || []
    var n = listeners.length
    var i = -1
    while (++ i < n) listeners[i].apply(s, args)
    return s
  }


  function setup(s, fn) {
    on(s, 'reconnect', fn)
    fn.call(s)
    return s
  }


  function teardown(s, fn) {
    on(s, 'disconnect', fn)
    on(s, 'reset', fn)
    return s
  }


  function val(x) {
    var s = sig()
    s.sticky = true
    if (arguments.length) put(s, x)
    return s
  }


  function ensureVal(v) {
    return isSig(v)
      ? then(v, val())
      : val(v)
  }


  function map(s, fn) {
    return then(s, prime(slice(arguments, 2), function(x) {
      put(this, fn.apply(this, arguments))
    }))
  }


  function filter(s, fn) {
    fn = fn || identity

    return then(s, prime(slice(arguments, 2), function(x) {
      if (fn.apply(this, arguments)) put(this, x)
    }))
  }


  function flatten(s) {
    return then(s, function(x) {
      deepEach(x, to, this)
    })
  }


  function deepEach(arr, fn) {
    fn = prime(slice(arguments, 2), fn)
    if (!isArray(arr)) return fn(arr)
    var i = -1
    var n = arr.length
    while (++i < n) deepEach(arr[i], fn)
  }


  function limit(s, n) {
    var i = 0
    
    return then(s, function(x) {
      if (++i <= n) put(this, x)
    })
  }


  function once(s) {
    return limit(s, 1)
  }


  function ensure(v) {
    return !isSig(v)
      ? sig([v])
      : v
  }


  function redir(s, t) {
    var u
    u = then(s, to, t)
    u = except(u, raiseTo, t)
    on(t, 'disconnect', function() { reset(u) })
    return u
  }


  function resolve(s) {
    return put(s, null)
  }


  function to(x, s) {
    put(s, x)
  }


  function raiseTo(e, s) {
    raise(s, e)
  }


  function any(values) {
    var out = sig()
    if (isArguments(values)) values = slice(values)

    each(values, function(s, k) {
      if (!isSig(s)) return
      redir(map(s, next, k), out)
    })
    
    return out

    function next(x, k) {
      return [x, k]
    }
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
    else each(values, function(s, k) {
      if (!isSig(s)) return
      redir(then(s, next, k), out)
    })

    return out

    function next(x, k) {
      delete remaining[k]
      values[k] = x
      if (isEmpty(remaining)) put(this, copy(values))
    }
  }


  function merge(values) {
    return map(any(values), spread, identity)
  }


  function update(s, fn) {
    var curr
    var out = sig()
    fn = prime(slice(arguments, 2), fn || identity)

    var t = then(s, function(x) {
      if (curr) reset(curr)

      var u = fn(x)
      if (!isSig(u)) return

      curr = redir(u, out)
    })

    redir(t, out)
    return out
  }


  function append(s, fn) {
    var out = sig()
    fn = prime(slice(arguments, 2), fn || identity)

    var t = then(s, function(x) {
      var u = fn(x)
      if (isSig(u)) redir(u, out)
    })

    redir(t, out)
    return out
  }


  function isSig(s) {
    return (s || 0).type == 'sig'
  }


  function spread(args, fn) {
    return fn.apply(this, args)
  }


  function log() {
    return _log.apply(console, arguments)
  }


  function prime(args, fn) {
    if (!args.length) return fn

    return function(x) {
      return fn.apply(this, [x].concat(args))
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


  function slice(arr, a, b) {
    return _slice.call(arr, a, b)
  }


  function isArguments( obj ) {
    return typeof obj == 'object'
        && typeof obj.length == 'number'
        && 'callee' in obj
  }


  function identity(x) {
    return x
  }


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
