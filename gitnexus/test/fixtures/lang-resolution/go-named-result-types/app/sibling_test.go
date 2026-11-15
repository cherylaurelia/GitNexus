package app

func testUsesNamed() {
	x, _ := NewNamedPair()
	x.Use(7)
}
