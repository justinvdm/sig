;(function() {
  var _nil_ = {}
  var _adapters_ = []

  var isArray = Array.isArray
  var _slice = Array.prototype.slice
  var _log = console.log


  function sig() {
    return create.apply(this, arguments)
  }


  function Sig() {
    this.targets = []
    this.source = null
    this.handlers = {}
    this.handlers.value = putNextHandler
    this.handlers.error = throwNextHandler
    this.current = _nil_
    this.inBuffer = []
    this.outBuffer = []
    this.eventListeners = {}
    this.paused = true
    this.started = false
    this.sticky = false
    this.waiting = true
    this.ended = false
    this.disconnected = false
    this.isDependant = false
  }


  sig.adapts = function(test, adapt) {
    _adapters_.push({
      test: test,
      adapt: adapt
    })

    return this
  }


  sig.val = function(v) {
    var s = sig()
    s.sticky = true
    if (arguments.length) s.put(v)
    return s
  }


  sig.ensureVal = function(v) {
    return sig.isSig(v)
      ? v.then(sig.val())
      : sig.val(v)
  }


  sig.any = function(values) {
    if (isArguments(values)) values = sig.slice(values)
    var s = sig()

    var t = s
     .filter(sig.spread, sig.isSig)
     .each(sig.spread, function(u, k) {
       u.map(identityAll, k).redir(this)
     })

    s.putEach(pairs(values))
    return t
  }


  sig.all = function(values) {
    var out = sig.val()
    var remaining = {}
    values = copy(values)

    objEach(values, function(s, k) {
      if (sig.isSig(s)) remaining[k] = true
    })

    if (!isEmpty(remaining))
      objEach(values, function(s, k) {
        if (sig.isSig(s)) s.each(output, k).redir(out)
      })
    else
      out.put(values)

    return out

    function output(v, k) {
      delete remaining[k]
      values[k] = v
      if (isEmpty(remaining)) this.put(copy(values))
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


  sig.putTo = function(v, s) {
    s.put(v)
    return this
  }


  sig.functor = function(v) {
    return typeof v != 'function'
      ? function() { return v }
      : v
  }


  sig.prototype.end = function() {
    if (this.ending || this.ended) return this

    var uncleanBuffer = !!this.outBuffer.length
    this.ending = true
    emit(this, 'ending')

    send(this, {type: 'end'})
    disconnect(this)

    // if there are messages in the buffer, we need to wait for a flush before
    // we can end the signal
    if (uncleanBuffer) on(this, 'flush', forceEnd, this)
    else forceEnd(this)

    return this
  }


  sig.prototype.kill = function() {
    if (this.ended) return this
    forceEnd(this)
    return this
  }


  sig.prototype.teardown = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn)
    if (this.ended) fn.call(this)
    else on(this, 'end', fn)
    return this
  }


  sig.prototype.put = function(v) {
    if (this.ended) return this
    if (this.sticky) this.current = v

    send(this, {
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
    if (this.ended) throw e

    send(this, {
      type: 'error',
      data: e
    })

    return this
  }


  sig.prototype.then = function() {
    var t = sig.apply(this, arguments)
    if (!this.ended) connect(this, t)
    return t
  }


  sig.prototype.catch = function() {
    return this.then(fromErrorHandler.apply(this, arguments))
  }


  sig.prototype.done = function(fn) {
    var s = this
    var errored = false
    fn = fn || throwingCallback

    return this
      .then(function() {
        this.next()
      })
      .catch(function(e) {
        errored = true
        fn(e)
        s.kill()
      })
      .teardown(function() {
        if (!errored) fn()
      })
      .call(startChain)
  }


  sig.prototype.each = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn)

    return this.then(function() {
      try { fn.apply(this, arguments) }
      catch(e) { this.throw(e) }
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
      deepEach(v, sig.putTo, this)
    })
  }


  sig.prototype.limit = function(n) {
    var i = 0
    
    return this.each(function(v) {
      if (++i <= n) this.put(v)
      if (i >= n) this.end()
    })
  }


  sig.prototype.once = function() {
    return this.limit(1)
  }


  sig.prototype.redir = sig.prototype.to = function(t) {
    return this
      .each(sig.putTo, t)
      .catch(function(e) {
        t.throw(e)
        this.next()
      })
      .done()
      .call(dependOn, t)
  }


  sig.prototype.resolve = function(v) {
    this.put(v).end()
    return this
  }


  sig.prototype.putEach = function(values) {
    var n = values.length
    var i = -1
    while (++i < n) this.put(values[i])
    return this
  }


  sig.prototype.putTo = function(s) {
    s.put(this)
    return this
  }


  sig.prototype.update = function(fn) {
    var curr
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this.each(function(v) {
      if (curr) curr.end()
      var u = fn(v)
      if (sig.isSig(u)) curr = u.redir(this)
    })
  }


  sig.prototype.append = function(fn) {
    fn = sig.prime(sig.slice(arguments, 1), fn || sig.identity)

    return this
      .map(fn)
      .filter(sig.isSig)
      .each(function(s) { s.redir(this) })
  }


  sig.prototype.tap = function(obj) {
    return typeof obj == 'function'
      ? tapFn(this, obj, sig.slice(arguments, 1))
      : tapSig(this, obj)
  }


  sig.prototype.call = function(fn) {
    return fn.apply(this, [this].concat(sig.slice(arguments, 1)))
  }


  var handlers = {}


  handlers.end = function(s) {
    s.end()
  }


  handlers.value = function(s, v) {
    s.handlers.value.call(s, v)
  }


  handlers.error = function(s, e) {
    s.handlers.error.call(s, e)
  }


  function create() {
    var adapt = findAdapter.apply(this, arguments)

    if (!adapt) throw new Error(
      'No sig adapter found for arguments: ' + sig.slice(arguments).join(', '))

    return adapt.apply(this, arguments)
  }


  function findAdapter() {
    var n = _adapters_.length
    var i = -1
    var d

    while (++i < n) {
      d = _adapters_[i]
      if (!d.test.apply(this, arguments)) continue
      return d.adapt
    }
  }


  function fromArray(arr) {
    var s = sig()
    s.putEach(arr)
    return s
  }


  function newSig() {
    return new Sig()
  }


  function noArgs() {
    return !arguments.length
  }


  function putNextHandler(v) {
    this.put(v).next()
  }


  function throwNextHandler(e) {
    this.throw(e).next()
  }


  function connect(s, t) {
    setSource(t, s)
    addTarget(s, t)

    if (s.disconnected) reconnect(s)

    if (s.started && s.current != _nil_) receive(t, {
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


  function flush(s) {
    var buffer = s.outBuffer
    var i = -1
    var n = buffer.length
    while (++i < n) forceSend(s, buffer.shift())
    s.outBuffer = []
    emit(s, 'flush')
  }


  function start(s) {
    if (s.started) return
    s.started = true
    s.resume()
  }


  function startChain(s) {
    if (s.source) startChain(s.source)
    start(s)
    return s
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


  function send(s, msg) {
    if (s.paused) s.outBuffer.push(msg)
    else forceSend(s, msg)
  }


  function forceSend(s, msg) {
    var targets = sig.slice(s.targets)
    var i = -1
    var n = targets.length
    while (++i < n) receive(targets[i], msg)
  }


  function fromValueHandler(fn) {
    var s = sig()
    s.handlers.value = sig.prime(sig.slice(arguments, 1), fn)
    return s
  }


  function fromErrorHandler(fn) {
    var s = sig()
    s.handlers.error = sig.prime(sig.slice(arguments, 1), fn)
    return s
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
    s.current = _nil_
  }


  function forceEnd(s) {
    emit(s, 'end')
    disconnect(s)
    clear(s)
    s.ended = true
    s.ending = false
  }


  function throwingCallback(err) {
    if (err) throw err
  }


  function tapFn(s, fn, args) {
    fn = sig.prime(args, fn)

    return s.map(function(v) {
      fn.call(this, v)
      return v
    })
  }


  function tapSig(s, t) {
    var u = s.then(sig())

    s.redir(t)
     .call(dependOn, u)

    return u
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


  function isFn(obj) {
    return typeof obj == 'function'
  }


  function isArguments(obj) {
    return typeof obj == 'object'
        && typeof obj.length == 'number'
        && 'callee' in obj
  }


  sig
    .adapts(noArgs, newSig)
    .adapts(isFn, fromValueHandler)
    .adapts(isArray, fromArray)
    .adapts(sig.isSig, sig.identity)

  sig.put = sig.static(sig.prototype.put)
  sig.throw = sig.static(sig.prototype.throw)
  sig.next = sig.static(sig.prototype.next)
  sig.end = sig.static(sig.prototype.end)
  sig.kill = sig.static(sig.prototype.kill)
  sig.then = sig.static(sig.prototype.then)
  sig.then = sig.static(sig.prototype.then)
  sig.catch = sig.static(sig.prototype.catch)
  sig.done = sig.static(sig.prototype.done)
  sig.resolve = sig.static(sig.prototype.resolve)
  sig.putEach = sig.static(sig.prototype.putEach)
  sig.receive = sig.static(sig.prototype.receive)
  sig.teardown = sig.static(sig.prototype.teardown)
  sig.each = sig.static(sig.prototype.each)
  sig.tap = sig.static(sig.prototype.tap)
  sig.map = sig.static(sig.prototype.map)
  sig.filter = sig.static(sig.prototype.filter)
  sig.flatten = sig.static(sig.prototype.flatten)
  sig.limit = sig.static(sig.prototype.limit)
  sig.once = sig.static(sig.prototype.once)
  sig.redir = sig.to = sig.static(sig.prototype.to)
  sig.update = sig.static(sig.prototype.update)
  sig.append = sig.static(sig.prototype.append)
  sig.call = sig.static(sig.prototype.call)

  sig._on_ = on
  sig._nil_ = _nil_
  sig._adapters_ = _adapters_

  sig.Sig = Sig
  Sig.prototype = sig.prototype


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
