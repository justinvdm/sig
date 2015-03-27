;(function() {
  var _nil_ = {}
  var _end_ = {}

  var isArray = Array.isArray
  var _slice = Array.prototype.slice
  var _log = console.log


  function sig(obj) {
    if (isSig(obj)) return obj

    var s = new Sig()
    s.targets = []
    s.source = null
    s.eager = true
    s.sticky = false
    s.processor = putNextProcessor
    s.errorHandler = raiseNextHandler
    s.paused = true
    s.current = _nil_
    s.inBuffer = []
    s.outBuffer = []
    s.error = null
    s.waiting = true
    s.ended = false
    s.disconnected = false
    s.eventListeners = {}

    if (obj) putMany(s, obj)
    return s
  }


  function Sig() {}
  Sig.prototype = sig.prototype


  function putNextProcessor(x) {
    putNext(this, x)
  }


  function raiseNextHandler(e) {
    raiseNext(this, e)
  }


  function connect(s, t) {
    var firstTarget = !s.targets.length

    setSource(t, s)
    addTarget(s, t)

    if (s.disconnected) reconnect(s)
    if (s.eager && firstTarget) resume(s)
    else if (s.sticky && s.current != _nil_) receive(t, s.current)
    return s
  }


  function disconnect(t) {
    if (t.disconnected) return t
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


  function end(s) {
    emit(s, 'end')
    disconnect(s)
    put(s, _end_)
    s.ended = true
    return s
  }


  function put(s, x) {
    if (s.sticky) s.current = x
    if (s.paused) buffer(s, x)
    else send(s, x)
    return s
  }


  function next(s) {
    if (!s.inBuffer.length) s.waiting = true
    else process(s, s.inBuffer.shift())
    return s
  }


  function process(s, x) {
    if (x == _end_) end(s)
    else s.processor(x)
    return s
  }


  function receive(s, x) {
    s.inBuffer.push(x)

    if (s.waiting) {
      s.waiting = false
      next(s)
    }

    return s
  }


  function send(s, x) {
    var targets = slice(s.targets)
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], x)
    return s
  }


  function buffer(s, x) {
    s.outBuffer.push(x)
    return s
  }


  function flush(s) {
    var buffer = s.outBuffer
    var i = -1
    var n = buffer.length
    while (++i < n) send(s, buffer[i])
    s.outBuffer = []
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
    then(s, t)
    return t
  }


  function then(s, obj) {
    return typeof obj == 'function'
      ? thenFn.apply(this, arguments)
      : thenSig.apply(this, arguments)
  }


  function thenFn(s, fn) {
    var t = sig()
    t.processor = prime(slice(arguments, 2), fn)
    return thenSig(s, t)
  }


  function thenSig(s, t) {
    connect(s, t)
    return t
  }


  function on(s, event, fn) {
    fn = prime(slice(arguments, 3), fn)
    var listeners = s.eventListeners[event] || []
    s.eventListeners[event] = listeners
    listeners.push(fn)
    return s
  }


  function emit(s, event) {
    var args = slice(arguments, 2)
    var listeners = slice(s.eventListeners[event] || [])
    var n = listeners.length
    var i = -1
    while (++ i < n) listeners[i].apply(s, args)
    return s
  }


  function teardown(s, fn) {
    fn = prime(slice(arguments, 2), fn)
    if (s.ended) fn.call(s)
    else on(s, 'end', fn)
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
    fn = prime(slice(arguments, 2), fn)

    return then(s, function() {
      putNext(this, fn.apply(this, arguments))
    })
  }


  function filter(s, fn) {
    fn = prime(slice(arguments, 2), fn || identity)

    return then(s, function(x) {
      if (fn.apply(this, arguments)) put(this, x)
      next(this)
    })
  }


  function flatten(s) {
    return then(s, function(x) {
      deepEach(x, to, this)
      next(this)
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
      if (++i <= n) putNext(this, x)
      if (i >= n) end(this)
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

    u = then(s, function(v) {
      put(t, v)
      next(this)
    })

    u = except(u, function(e) {
      raise(t, e)
      next(this)
    })

    on(t, 'disconnect', disconnect, u)
    return u
  }


  function resolve(s, v) {
    put(s, v)
    end(s)
    return s
  }


  function putNext(s, v) {
    put(s, v)
    next(s)
  }


  function raiseNext(s, e) {
    raise(s, e)
    next(s)
  }


  function putMany(s, values) {
    var n = values.length
    var i = -1
    while (++i < n) put(s, values[i])
    return s
  }


  function to(v, s) {
    put(s, v)
  }


  function any(values) {
    var out = sig()
    if (isArguments(values)) values = slice(values)

    each(values, function(s, k) {
      if (isSig(s)) redir(map(s, output, k), out)
    })
    
    return out

    function output(v, k) {
      return [v, k]
    }
  }


  function all(values) {
    var out = sig()
    var remaining = {}
    values = copy(values)

    each(values, function(s, k) {
      if (isSig(s)) remaining[k] = true
    })

    if (isEmpty(remaining)) put(out, values)
    else each(values, function(s, k) {
      if (isSig(s)) redir(then(s, output, k), out)
    })

    return out

    function output(x, k) {
      delete remaining[k]
      values[k] = x
      if (isEmpty(remaining)) put(this, copy(values))
      next(this)
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
      if (curr) end(curr)
      var u = fn(x)
      if (isSig(u)) curr = redir(u, out)
      next(this)
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
      next(this)
    })

    redir(t, out)
    return out
  }


  function isSig(s) {
    return s instanceof Sig
  }


  function spread(args, fn) {
    return fn.apply(this, args)
  }


  function log() {
    return _log.apply(console, arguments)
  }


  function call(s, fn) {
    return fn.apply(s, [s].concat(slice(arguments, 2)))
  }


  function prime(args, fn) {
    if (!args.length) return fn

    return function() {
      return fn.apply(this, slice(arguments).concat(args))
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


  function method(fn) {
    return function() {
      return fn.apply(this, [this].concat(slice(arguments)))
    }
  }


  sig.val = val
  sig.log = log
  sig.method = method
  sig.any = any
  sig.all = all
  sig.merge = merge
  sig.spread = spread
  sig.isSig = isSig
  sig.ensure = ensure
  sig.ensureVal = ensureVal
  sig.slice = slice
  sig.prime = prime
  sig.identity = identity


  sig.prototype.disconnect = method(sig.disconnect = disconnect)
  sig.prototype.reconnect = method(sig.reconnect = reconnect)
  sig.prototype.put = method(sig.put = put)
  sig.prototype.to = method(sig.to = to)
  sig.prototype.next = method(sig.next = next)
  sig.prototype.end = method(sig.end = end)
  sig.prototype.resolve = method(sig.resolve = resolve)
  sig.prototype.putMany = method(sig.putMany = putMany)
  sig.prototype.putNext = method(sig.putNext = putNext)
  sig.prototype.receive = method(sig.receive = receive)
  sig.prototype.pause = method(sig.pause = pause)
  sig.prototype.resume = method(sig.resume = resume)
  sig.prototype.raise = method(sig.raise = raise)
  sig.prototype.except = method(sig.except = except)
  sig.prototype.teardown = method(sig.teardown = teardown)
  sig.prototype.map = method(sig.map = map)
  sig.prototype.filter = method(sig.filter = filter)
  sig.prototype.flatten = method(sig.flatten = flatten)
  sig.prototype.limit = method(sig.limit = limit)
  sig.prototype.once = method(sig.once = once)
  sig.prototype.then = method(sig.then = then)
  sig.prototype.redir = method(sig.redir = redir)
  sig.prototype.update = method(sig.update = update)
  sig.prototype.append = method(sig.append = append)
  sig.prototype.call = method(sig.call = call)


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
