# Braided Cookbook

**Progressive recipes for building production systems with Braided.**

Each recipe is self-contained and copy-pastable. Start from the beginning and work your way through - each recipe builds on concepts from previous ones.

---

## 📚 **Recipes**

### **Part 1: Foundation - Single Resources**

Learn the basics by building individual resources.

1. **[Config (Raw)](./01-config-raw.md)** - Load environment variables into a simple config object
2. **[Config (Typed)](./02-config-typed.md)** - Add Zod validation for type-safe configuration
3. **[Express (Standalone)](./03-express-standalone.md)** - HTTP server with graceful shutdown

### **Part 2: Composition - Dependencies** _(Coming Soon)_

Learn how resources depend on each other.

4. **Database (Standalone)** - Prisma client with connection management
5. **Database + Config** - Database resource that uses config
6. **Redis (Standalone)** - Redis client with connection lifecycle
7. **Redis + Config** - Redis resource that uses config
8. **Express + Database + Config** - Full backend stack

### **Part 3: Complex Systems - Emergence** _(Coming Soon)_

Learn how complex systems emerge from simple composition.

9. **Queue Worker** - Background job processor with Redis
10. **Full Stack** - Config + Database + Redis + Express + Queue Worker

---

## 🎯 **How to Use This Cookbook**

### **1. Read Progressively**
Start with Recipe 1 and work your way through. Each recipe assumes you understand previous ones.

### **2. Copy-Paste and Experiment**
All code is production-ready and copy-pastable. Try it in your own projects.

### **3. Check the Examples**
Each recipe has a corresponding runnable example in `/examples` that you can clone and run.

---

## 🧶 **Philosophy**

These recipes demonstrate Braided's core philosophy:

- **Resources live in closure space** - Independent of your framework
- **Dependencies are explicit** - Clear startup/shutdown order
- **Composition is simple** - Complex systems emerge from simple rules
- **Testing is natural** - Resources are orthogonal to your framework

---

## 💡 **What You'll Learn**

By the end of these recipes, you'll understand:

- How to structure resources with clear lifecycles
- How to compose resources with explicit dependencies
- How to achieve graceful shutdown in complex systems
- How to test systems without framework coupling
- How to swap implementations without changing dependents

---

**Let's start cooking!** 🧑‍🍳

Begin with [Recipe 1: Config (Raw)](./01-config-raw.md)

