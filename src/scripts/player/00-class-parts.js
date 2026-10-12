// Installs a group of methods on a class prototype. Large classes are written as one small file per
// feature; each file calls install() with an object literal of methods. Installed methods match class
// methods exactly: non-enumerable, writable and configurable. Files wrap their literal in a strict-mode
// function, so the code runs in strict mode as it does inside a class body.
const PekoClassParts = {
  install(targetClass, methods) {
    const proto = targetClass.prototype;
    for (const name of Reflect.ownKeys(methods)) {
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        throw new Error(`${targetClass.name}.${String(name)} is defined more than once`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(methods, name);
      descriptor.enumerable = false;
      Object.defineProperty(proto, name, descriptor);
    }
  },
};
