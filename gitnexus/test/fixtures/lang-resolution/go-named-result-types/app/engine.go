package app

type Engine struct{ n int }

func (e *Engine) Use(x int) { e.n += x }

type Context struct{}

func (c *Context) Render() {}

type Other struct{}

func (o *Other) Use(x int) {}

// Named results: the type must be read from the result, not the name.
func NewNamed() (e *Engine) { return &Engine{} }

func NewNamedPair() (e *Engine, err error) { return &Engine{}, nil }

func NewGrouped() (c *Context, r *Engine) { return &Context{}, &Engine{} }

func NewSameType() (a, b *Engine) { return &Engine{}, &Engine{} }

func NewOther() (o *Other) { return &Other{} }

func NewValue() (v Engine) { return Engine{} }

func useSameFile() {
	x := NewNamed()
	x.Use(1)
}
