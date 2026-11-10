import XCTest

@MainActor
final class SafariAIAgentHostUITests: XCTestCase {
    func testBrowserLoadsPageAndOpensLocalInspector() {
        let app = XCUIApplication()
        app.launchArguments += ["-gatewayAddress", "", "-deviceToken", ""]
        app.launch()

        XCTAssertTrue(app.staticTexts["Gateway disconnected."].waitForExistence(timeout: 5))
        let connectButton = app.buttons["Connect"]
        XCTAssertTrue(connectButton.exists)
        XCTAssertFalse(connectButton.isEnabled)

        let inspectButton = app.buttons["Inspect locally"]
        XCTAssertTrue(inspectButton.exists)
        XCTAssertFalse(inspectButton.isEnabled)

        let goButton = app.buttons["Go"]
        XCTAssertTrue(goButton.waitForExistence(timeout: 5))
        goButton.tap()

        let enabled = NSPredicate(format: "isEnabled == true")
        expectation(for: enabled, evaluatedWith: inspectButton)
        waitForExpectations(timeout: 20)
        inspectButton.tap()

        XCTAssertTrue(app.navigationBars["Local inspection"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Title, Example Domain"].waitForExistence(timeout: 10))
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["local-inspection-privacy-note"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Done"].exists)
    }

    func testGatewayInspectionFillAndNativeApproval() async throws {
        let origin = "https://127.0.0.1:4049"
        let deviceToken = String(repeating: "a", count: 48)
        let healthURL = try XCTUnwrap(URL(string: origin + "/health"))
        do {
            let (healthData, healthResponse) = try await URLSession.shared.data(for: URLRequest(url: healthURL))
            guard (healthResponse as? HTTPURLResponse)?.statusCode == 200,
                  let health = try JSONSerialization.jsonObject(with: healthData) as? [String: Any],
                  health["suite"] as? String == "safari-ai-agent-swift-bridge-test",
                  health["version"] as? Int == 1 else {
                throw XCTSkip("The isolated localhost HTTPS gateway fixture is not running.")
            }
        } catch let skip as XCTSkip {
            throw skip
        } catch {
            throw XCTSkip("Run Tests/run-gateway-bridge-test.sh to start the trusted local HTTPS fixture.")
        }

        let app = XCUIApplication()
        app.launchArguments += ["-gatewayAddress", origin, "-deviceToken", ""]
        app.launch()

        let address = app.textFields["browser-address-field"]
        XCTAssertTrue(address.waitForExistence(timeout: 10))
        address.tap()
        let currentAddress = address.value as? String ?? ""
        address.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentAddress.count))
        address.typeText(origin + "/page")
        app.buttons["Go"].tap()
        XCTAssertTrue(app.staticTexts["Loaded. Use Inspect to view a local, read-only snapshot."].waitForExistence(timeout: 20))

        let tokenField = app.secureTextFields["device-token-field"]
        XCTAssertTrue(tokenField.waitForExistence(timeout: 5))
        tokenField.tap()
        tokenField.typeText(deviceToken)
        app.buttons["Connect"].tap()
        let connected = app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", "Connected to https://127.0.0.1:")).firstMatch
        guard connected.waitForExistence(timeout: 15) else {
            let visibleStatus = app.debugDescription
            XCTFail("Swift app did not connect to the local gateway. Visible status: \(visibleStatus)")
            return
        }

        let snapshot = try await fixtureCall(origin: origin, name: "browser_inspect")
        let elements = try XCTUnwrap(snapshot["data"] as? [String: Any])["elements"] as? [[String: Any]] ?? []
        let fieldRef = try XCTUnwrap(elements.first(where: { $0["label"] as? String == "Pilot note" })?["ref"] as? String)
        let buttonRef = try XCTUnwrap(elements.first(where: { $0["label"] as? String == "Mark complete" })?["ref"] as? String)

        let fillTask = Task { try await fixtureCall(origin: origin, name: "browser_fill", arguments: ["ref": fieldRef, "value": "Swift bridge passed"]) }
        let allowFill = app.buttons["native-approval-allow-once"]
        guard allowFill.waitForExistence(timeout: 10) else {
            let visibleStatus = app.debugDescription
            let result = try await fillTask.value
            XCTFail("Fill approval was not presented. Visible status: \(visibleStatus). Bridge result: \(result)")
            return
        }
        allowFill.tap()
        let fill = try await fillTask.value
        XCTAssertEqual(fill["success"] as? Bool, true)

        let filled = try await fixtureCall(origin: origin, name: "browser_verify", arguments: ["textIncludes": "Status: FILLED"])
        XCTAssertEqual(filled["success"] as? Bool, true)

        let deniedClick = Task { try await fixtureCall(origin: origin, name: "browser_click", arguments: ["ref": buttonRef]) }
        let denyButton = app.buttons["native-approval-deny"]
        XCTAssertTrue(denyButton.waitForExistence(timeout: 10))
        denyButton.tap()
        let denied = try await deniedClick.value
        XCTAssertEqual(denied["success"] as? Bool, false)

        let approvedClick = Task { try await fixtureCall(origin: origin, name: "browser_click", arguments: ["ref": buttonRef]) }
        XCTAssertTrue(allowFill.waitForExistence(timeout: 10))
        allowFill.tap()
        let approved = try await approvedClick.value
        XCTAssertEqual(approved["success"] as? Bool, true)

        let clicked = try await fixtureCall(origin: origin, name: "browser_verify", arguments: ["textIncludes": "Status: CLICKED"])
        XCTAssertEqual(clicked["success"] as? Bool, true)

        let destination = origin + "/page?swift-bridge=navigation-passed"
        let navigation = Task { try await fixtureCall(origin: origin, name: "browser_navigate", arguments: ["url": destination]) }
        XCTAssertTrue(allowFill.waitForExistence(timeout: 10))
        allowFill.tap()
        let navigated = try await navigation.value
        XCTAssertEqual(navigated["success"] as? Bool, true)
        XCTAssertEqual(navigated["dispatched"] as? Bool, true)

        let verificationDeadline = Date().addingTimeInterval(15)
        var navigationVerified = false
        while Date() < verificationDeadline {
            let result = try await fixtureCall(origin: origin, name: "browser_verify", arguments: ["urlIncludes": "swift-bridge=navigation-passed"])
            if result["success"] as? Bool == true {
                navigationVerified = true
                break
            }
            try await Task.sleep(for: .milliseconds(250))
        }
        XCTAssertTrue(navigationVerified, "The approved same-origin navigation did not load before timeout.")

        app.buttons["Disconnect"].tap()
        XCTAssertTrue(app.staticTexts["Gateway disconnected."].waitForExistence(timeout: 10))
    }

    private func fixtureCall(origin: String, name: String, arguments: [String: Any] = [:]) async throws -> [String: Any] {
        let url = try XCTUnwrap(URL(string: origin + "/__fixture/call"))
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["name": name, "arguments": arguments])
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = try XCTUnwrap(response as? HTTPURLResponse)
        XCTAssertEqual(http.statusCode, 200, String(data: data, encoding: .utf8) ?? "")
        let payload = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let content = try XCTUnwrap(payload["content"] as? [[String: Any]]).first
        let text = try XCTUnwrap(content?["text"] as? String)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
    }
}
