# Target Escape Pass

Status: design experiment, not specification  
Scope: second pass over `docs/experiments/js-interop-stdlib`

This pass repeats the JavaScript standard-library pressure test with target
escapes instead of foreign declaration syntax.

The core idea is:

> Polena type-checks the inputs, pauses normal lowering, emits a trusted
> JavaScript target expression, then resumes with a declared Polena type.

The sketches use imagined directive forms:

```polena
@target.js("console.log($0)", message)
@target.js.option("process.env[$0]", name)
@target.js.try("JSON.parse($0)", input)
```

These names are placeholders. The pass is intended to test whether "target
escape" is a better abstraction than a dedicated JavaScript interop declaration
language.

Read `RESULTS.md` for the evaluation.
