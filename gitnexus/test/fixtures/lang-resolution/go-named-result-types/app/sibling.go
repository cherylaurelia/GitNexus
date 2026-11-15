package app

func useNamed() {
	x := NewNamed()
	x.Use(2)
}

func useNamedPair() {
	x, _ := NewNamedPair()
	x.Use(3)
}

func useGrouped() {
	c, _ := NewGrouped()
	c.Render()
}

func useSameType() {
	_, b := NewSameType()
	b.Use(5)
}

func useOther() {
	o := NewOther()
	o.Use(6)
}

func useValue() {
	v := NewValue()
	v.Use(12)
}
