;(function() {
  var _nil_ = {}

  var isArray = Array.isArray
  var _slice = Array.prototype.slice
  var _log = console.log


  function sig(obj) {
    if (sig.isSig(obj)) return obj

    var s = new Sig()
    s.targets = []
    s.source = null
    s.handlers = {}
    s.handlers.value = putNextHandler
    s.handlers.error = throwNextHandler
    s.current = _nil_
    s.inBuffer = []
    s.outBuffer = []
    s.eventListeners = {}
    s.eager = true
    s.sticky = false
    s.waiting = true
    s.killed = false
    s.paused = true
    s.disconnected = false
    s.isDependant = false

    if (obj) s.putMany(obj)
    return s
  }


  sig.val = function(v) {
    var s = sig()
    s.sticky = true
    if (arguments.length) s.put(v)
    return s
  }


  sig.ensure = function(v) {
    return !sig.isSig(v)
      ? sig([v])
      : v
  }


  sig.ensureVal = function(v) {
    return sig.isSig(v)
      ? v.then(sig.val())
      : sig.val(v)
  }


  sig.any = function(values) {
    if (isArguments(values)) values = sig.slice(values)

    return sig(pairs(values))
      .filter(sig.spread, sig.isSig)
      .each(sig.spread, function(s, k) {
        s.map(identityAll, k).redir(this)
      })
  }


  sig.all = function(values) {
    var out = sig()
    var remaining = {}
    values = copy(values)

    objEach(values, function(s, k) {
      if (sig.isSig(s)) remaining[k] = true
    })

    if (!isEmpty(remaining))
      objEach(values, function(s, k) {
        if (sig.isSig(s)) s.then(output, k).redir(out)
      })
    else
      out.put(values)

    return out

    function output(v, k) {
      delete remaining[k]
      values[k] = v
      if (isEmpty(remaining)) this.put(copy(values))
      this.next()
    }
  }


  sig.merge = function(values) {
    return sig.any(values)
      .map(sig.spread, sig.identity)
  }


  sig.isSig = function(s) {
    return s instanceof Sig
  }


  sig.spread = function(args, fn) {
    return fn.apply(this, args)
  }


  sig.log = function(v) {
    _log.apply(console, arguments)
    return v
  }


  sig.prime = function(args, fn) {
    if (!args.length) return fn

    return function() {
      return fn.apply(this, sig.slice(arguments).concat(args))
    }
  }


  sig.slice = function(arr, a, b) {
    return _slice.call(arr, a, b)
  }


  sig.identity = function(v) {
    return v
  }


  sig.static = function(fn) {
    return function(that) {
      return fn.apply(that, sig.slice(arguments, 1))
    }
  }


  sig.to = function(v, s) {
    s.put(v)
  }


  sig.functor = function(v) {
    return typeof v != 'function'
      ? function() { return v }
      : v
  }


  sig.prototype.kill = function() {
    // if there are messages in the buffer, wait for a flush before killing
    if (this.outBuffer.length)
      on(this, 'flush', kill, this)
    else
      kill(this)

    return this
  }


  sig.prototype.teardown = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn)
    if (this.killed) fn.call(this)
    else on(this, 'kill', fn)
    return this
  }


  sig.prototype.put = function(v) {
    if (this.killed) return this
    if (this.sticky) this.current = v

    propagate(this, {
      type: 'value',
      data: v
    })

    return this
  }


  sig.prototype.next = function() {
    if (!this.inBuffer.length) this.waiting = true
    else handle(this, this.inBuffer.shift())
    return this
  }


  sig.prototype.pause = function() {
    this.paused = true
    return this
  }


  sig.prototype.resume = function() {
    this.paused = false
    flush(this)
    return this
  }


  sig.prototype.throw = function(e) {
    if (this.killed) return this
    if (!this.targets.length) throw e

    propagate(this, {
      type: 'error',
      data: e
    })

    return this
  }


  sig.prototype.then = function(obj) {
    return typeof obj == 'function'
      ? thenFn(this, obj, sig.slice(arguments, 1))
      : thenSig(this, obj)
  }


  sig.prototype.catch = function(fn) {
    var t = sig()
    fn = sig.prime(sig.slice(arguments, 1), fn)
    t.handlers.error = fn
    this.then(t)
    return t
  }


  sig.prototype.each = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn)

    return this.then(function() {
      fn.apply(this, arguments)
      this.next()
    })
  }


  sig.prototype.map = function(fn) {
    fn = sig.functor(fn)
    fn = sig.prime(sig.slice(arguments, 1), fn)

    return this.each(function() {
      this.put(fn.apply(this, arguments))
    })
  }


  sig.prototype.filter = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this.each(function(v) {
      if (fn.apply(this, arguments)) this.put(v)
    })
  }


  sig.prototype.flatten = function() {
    return this.each(function(v) {
      deepEach(v, sig.to, this)
    })
  }


  sig.prototype.limit = function(n) {
    var i = 0
    
    return this.each(function(v) {
      if (++i <= n) this.put(v)
      if (i >= n) this.kill()
    })
  }


  sig.prototype.once = function() {
    return this.limit(1)
  }


  sig.prototype.redir = function(t) {
    return this
      .each(sig.to, t)
      .catch(function(e) {
        t.throw(e)
        this.next()
      })
      .call(dependOn, t)
  }


  sig.prototype.resolve = function(v) {
    this.put(v).kill()
    return this
  }


  sig.prototype.putMany = function(values) {
    var n = values.length
    var i = -1
    while (++i < n) this.put(values[i])
    return this
  }


  sig.prototype.to = function(s) {
    s.put(this)
    return this
  }


  sig.prototype.update = function(fn) {
    var curr
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this.each(function(v) {
      if (curr) curr.kill()
      var u = fn(v)
      if (sig.isSig(u)) curr = u.redir(this)
    })
  }


  sig.prototype.append = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this
      .map(fn)
      .filter(sig.isSig)
      .each(function(s) {
        s.redir(this)
      })
  }


  sig.prototype.call = function(fn) {
    return fn.apply(this, [this].concat(sig.slice(arguments, 1)))
  }


  var handlers = {}


  handlers.kill = function(s) {
    s.kill()
  }


  handlers.value = function(s, v) {
    s.handlers.value.call(s, v)
  }


  handlers.error = function(s, e) {
    s.handlers.error.call(s, e)
  }


  function putNextHandler(v) {
    this.put(v).next()
  }


  function throwNextHandler(e) {
    this.throw(e).next()
  }


  function connect(s, t) {
    var firstTarget = !s.targets.length

    setSource(t, s)
    addTarget(s, t)

    if (s.disconnected) reconnect(s)
    if (s.eager && firstTarget) s.resume()
    else if (s.sticky && s.current != _nil_) receive(t, {
      type: 'value',
      data: s.current
    })
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
  }


  function addTarget(s, t) {
    s.targets.push(t)
  }


  function rmTarget(s, t) {
    rm(s.targets, t)
  }


  function setSource(t, s) {
    if (t.source) t.throw(new Error(
      "Cannot set signal's source, signal already has a source"))
    else t.source = s
  }


  function handle(s, msg) {
    if ('data' in msg) handlers[msg.type](s, msg.data)
    else handlers[msg.type](s)
  }


  function receive(s, msg) {
    s.inBuffer.push(msg)

    if (s.waiting) {
      s.waiting = false
      s.next()
    }
  }


  function propagate(s, msg) {
    // errors are a special case, force sending
    if (s.paused && msg.type != 'error') s.outBuffer.push(msg)
    else send(s, msg)
  }


  function send(s, msg) {
    var targets = sig.slice(s.targets)
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], msg)
  }


  function flush(s) {
    var buffer = s.outBuffer
    var i = -1
    var n = buffer.length
    while (++i < n) send(s, buffer[i])
    s.outBuffer = []
    emit(s, 'flush')
  }


  function thenFn(s, fn, args) {
    var t = sig()
    t.handlers.value = sig.prime(args, fn)
    thenSig(s, t)
    return t
  }


  function thenSig(s, t) {
    if (!s.killed) connect(s, t)
    return t
  }


  function on(s, event, fn) {
    fn = sig.prime(sig.slice(arguments, 3), fn)
    var listeners = s.eventListeners[event] || []
    s.eventListeners[event] = listeners
    listeners.push(fn)
  }


  function emit(s, event) {
    var args = sig.slice(arguments, 2)
    var listeners = sig.slice(s.eventListeners[event] || [])
    var n = listeners.length
    var i = -1
    while (++ i < n) listeners[i].apply(s, args)
  }


  function dependOn(s, t) {
    s.isDependant = true
    on(t, 'disconnect', disconnect, s)
    return s
  }


  function clear(s) {
    s.source = null
    s.targets = []
    s.inBuffer = []
    s.outBuffer = []
  }


  function kill(s) {
    emit(s, 'kill')
    propagate(s, {type: 'kill'})
    disconnect(s)
    clear(s)
    s.killed = true
  }


  function objEach(obj, fn) {
    if (Array.isArray(obj)) return obj.forEach(fn)
    for (var k in obj) if (obj.hasOwnProperty(k)) fn(obj[k], k)
  }


  function objMap(obj, fn) {
    var results = []
    objEach(obj, function(v, k) {
      results.push(fn(v, k))
    })
    return results
  }


  function deepEach(arr, fn) {
    fn = sig.prime(sig.slice(arguments, 2), fn)
    if (!isArray(arr)) return fn(arr)
    var i = -1
    var n = arr.length
    while (++i < n) deepEach(arr[i], fn)
  }


  function pairs(obj) {
    return objMap(obj, identityAll)
  }


  function identityAll() {
    return sig.slice(arguments)
  }


  function isEmpty(obj) {
    var k
    for (k in obj) return false
    return true
  }


  function copy(obj) {
    if (isArray(obj) || isArguments(obj)) return sig.slice(obj)
    var result = {}
    for (var k in obj) if (obj.hasOwnProperty(k)) result[k] = obj[k]
    return result
  }


  function rm(arr, v) {
    var i = arr.indexOf(v)
    if (i < 0) return
    arr.splice(i, 1)
  }


  function isArguments( obj ) {
    return typeof obj == 'object'
        && typeof obj.length == 'number'
        && 'callee' in obj
  }


  sig.put = sig.static(sig.prototype.put)
  sig.next = sig.static(sig.prototype.next)
  sig.kill = sig.static(sig.prototype.kill)
  sig.resolve = sig.static(sig.prototype.resolve)
  sig.putMany = sig.static(sig.prototype.putMany)
  sig.receive = sig.static(sig.prototype.receive)
  sig.pause = sig.static(sig.prototype.pause)
  sig.resume = sig.static(sig.prototype.resume)
  sig.throw = sig.static(sig.prototype.throw)
  sig.catch = sig.static(sig.prototype.catch)
  sig.teardown = sig.static(sig.prototype.teardown)
  sig.each = sig.static(sig.prototype.each)
  sig.map = sig.static(sig.prototype.map)
  sig.filter = sig.static(sig.prototype.filter)
  sig.flatten = sig.static(sig.prototype.flatten)
  sig.limit = sig.static(sig.prototype.limit)
  sig.once = sig.static(sig.prototype.once)
  sig.then = sig.static(sig.prototype.then)
  sig.redir = sig.static(sig.prototype.redir)
  sig.update = sig.static(sig.prototype.update)
  sig.append = sig.static(sig.prototype.append)
  sig.call = sig.static(sig.prototype.call)


  function Sig() {}
  Sig.prototype = sig.prototype


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
