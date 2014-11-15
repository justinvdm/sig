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
  sig.ensure = ensure
  sig.any = any
  sig.all = all
  sig.spread = spread
  sig.depend = depend
  sig.undepend = undepend
  sig.isSig = isSig


  function sig(obj) {
    if (isSig(obj)) return obj
    if (!arguments.length) obj = []
    else if (!Array.isArray(obj)) obj = [obj]

    var s = {
      type: 'sig',
      paused: true,
      sources: [],
      targets: [],
      buffer: obj,
      dependants: [],
      receiver: identityReceiver
    }

    return s
  }


  function identityReceiver(x, t) {
    push(t, x)
  }


  function reset(s) {
    s.sources.forEach(function(source) { untarget(s, source) })
    s.targets.forEach(function(target) { unsource(target, s) })
    s.dependants.forEach(reset)
    s.buffer = []
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
    var t = sig()
    var args = slice(arguments, 2)

    t.receiver = function(x, t) {
      push(t, fn.apply(t, [x].concat(args)))
    }

    watch(t, s)
    resume(s)
    return t
  }


  function filter(s, fn) {
    var t = sig()
    var args = slice(arguments, 2)
      
    t.receiver = function(x, t) {
      if (fn.apply(t, [x].concat(args))) push(t, x)
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
      else push(t, x)
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
      if (!sig.isSig(s)) return
      sig.depend(sig.map(s, pusher(k)), out)
    })

    function pusher(k) {
      return function(x, t) {
        sig.push(out, [x, k])
      }
    }

    return out
  }


  function all(values) {
    var out = sig()
    var remaining = {}
    values = copy(values)

    each(values, function(s, k) {
      if (!sig.isSig(s)) return
      remaining[k] = true
    })

    if (isEmpty(remaining)) sig.push(out, values)
    else each(values, watcher)

    function watcher(s, k) {
      if (!sig.isSig(s)) return
      sig.depend(sig.map(s, pusher(k)), out)
    }

    function pusher(k) {
      return function(x, t) {
        delete remaining[k]
        values[k] = x
        if (isEmpty(remaining)) sig.push(out, copy(values))
      }
    }

    return out
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


  if (typeof module != 'undefined')
    module.exports = sig
  else if (typeof define == 'function' && define.amd)
    define(function() { return sig })
  else
    this.sig = sig
}).call(this);
