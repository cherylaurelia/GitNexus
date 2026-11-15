package ext

// Same type name as app.Engine in an independent package.
type Engine struct{}

func (e *Engine) Use(x int) {}

func NewNamed() (e *Engine) { return &Engine{} }

func useExt() {
	x := NewNamed()
	x.Use(8)
}
