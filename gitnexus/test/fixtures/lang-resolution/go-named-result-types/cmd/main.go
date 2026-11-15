package cmd

import (
	"example.com/namedresult/app"
)

func crossApp() {
	x := app.NewNamed()
	x.Use(9)
}

func crossPair() {
	x, _ := app.NewNamedPair()
	x.Use(11)
}
