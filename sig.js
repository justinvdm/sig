;(function() {
  function sig() {
  }

  if (typeof module != 'undefined') {
    module.exports = sig
  }
  else if (typeof define == 'function' && define.amd) {
    define(function() {
      return sig
    })
  }
  else {
    this.sig = sig
  }
}).call(this);
