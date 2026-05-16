# Open Design Questions

Known unresolved design questions. Do not implement behavior that depends on these without settling the design first.

---

## 38. Open Design Questions

The following topics need further design:

1. Optional field shorthand syntax and the defaulting operator.
2. Generic type parameter constraints.
3. Function type syntax.
4. Trait syntax and semantics.
5. Anonymous function ergonomics.
6. Shadowing rules.
7. Object exactness and excess-property checks.
8. Exact standard-library names for reference and structural equality helpers.
9. Bigint division behavior.
10. Exact `Index` design.
11. Re-exports, opaque types, internal-module conventions, package and
    workspace dependency declarations, importing a package's own root
    module from within, combining library and executable roles in one
    package, the `main` return-type extension, the compilation-target
    field in `polena.toml`, and the full set of permitted
    compile-time-constant initializers.
12. JavaScript interop declaration format.
13. `.d.ts` conversion strategy.
14. Async model.
15. Compile-time evaluation and compiler directive phase model.
16. Custom user-thrown panic syntax, panic-from-`main` return-type
    conventions, and the interaction between panics and async unwinding.
17. Unsafe operations.
18. Standard library naming conventions.
19. Formatter canonical style.
20. Unicode identifiers and Unicode string escapes.
21. Object introspection depth and alias preservation.
22. Structural typing for object types and possible future distinct types.
23. Long-term mutability model.
24. User-defined directives, macros, and generated code hygiene.
