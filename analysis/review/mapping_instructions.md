# Mapping review: the 18 open participants

**Why:** The intended model consists of the boxes (participants) and arrows (messages) of the 11 sequence diagrams in Tomcat's architecture documentation. To check an arrow against the code, every box needs the Java type it stands for (the *mapping*, Section 4.5 of the paper). A script proposed a type for each of the 74 boxes by name matching. For 18 boxes it found several types with that name, or none. Two of us decide these 18 **independently**, and the paper reports how often we agreed (observer triangulation, Runeson & Höst).

**Rules:**
- Work on your own. Do not look at another reviewer's file and do not discuss the rows until both files are done.
- Fill in `mapping_<your name>.csv`: one row per box, with columns `type` and `reason`.
  - `type`: the fully qualified name of the type the box stands for, e.g. `org.apache.catalina.Host`, or `none` if the box should not be mapped to any type.
  - `reason`: one short sentence.
- Use the facts below. You do not need to read the Tomcat code. If you want to see the diagrams: `webapps/docs/architecture/` in the Tomcat source at tag 11.0.27.
- Write down how long it took (`analysis/effort_log.csv`, one row; fill in `ai_assistance` with the tool you used, or `none`).

The facts were checked against the source model (jQAssistant graph of the Tomcat 11.0.27 release JARs). Candidates are listed in alphabetical order.

## Boxes with several candidate types

| Box | Diagram | What the box does in the diagram | Facts from the code | Candidates |
|---|---|---|---|---|
| `BasicAuthenticator` | 41_basic | checks the login of a request (gets the realm, reads the `authorization` header, authenticates) | One candidate is in Tomcat's authentication package, the other in Tomcat's WebSocket implementation (`org.apache.tomcat.websocket`). WebSocket is out of scope (Section 4.1). | `org.apache.catalina.authenticator.BasicAuthenticator`, `org.apache.tomcat.websocket.BasicAuthenticator` |
| `Host` | 5, 6, 31 | starts Contexts, sends lifecycle events to `HostConfig`, `getPipeline()` | `org.apache.catalina.Host` has `getPipeline()` and `start()`. `org.apache.tomcat.util.http.parser.Host` parses the HTTP `Host` header and has neither. | `org.apache.catalina.Host`, `org.apache.tomcat.util.http.parser.Host` |
| `Wrapper` | 5, 31 | `start()`, `getPipeline()`, `allocate()`, `deallocate()` | `org.apache.catalina.Wrapper` has these methods. `jakarta.el.Util$Wrapper` belongs to Expression Language (out of scope, not scanned). | `jakarta.el.Util$Wrapper`, `org.apache.catalina.Wrapper` |
| `Request` | 31, 41 | `setRequest()`, `getHost()`, `getContext()`, `getWrapper()`, `getCoyoteRequest()` | `org.apache.catalina.connector.Request` has all five. `org.apache.coyote.Request` has none of them. Two further candidates are callback classes of the Jakarta Authentication API. | `jakarta.security.auth.message.callback.PrivateKeyCallback$Request`, `jakarta.security.auth.message.callback.SecretKeyCallback$Request`, `org.apache.catalina.connector.Request`, `org.apache.coyote.Request` |
| `CoyoteRequest` | 11, 31, 41 | created by the `Processor`, `setNote()`, `getMimeHeaders()` | `org.apache.coyote.Request` has `setNote()` and `getMimeHeaders()`. No type is called `CoyoteRequest`. | `org.apache.catalina.connector.Request`, `org.apache.coyote.Request`, `none` |
| `Response` | 31 | `CoyoteAdapter` calls `setResponse()` | `org.apache.catalina.connector.Response` has `setResponse()`. `org.apache.coyote.Response` does not. A third candidate is in the clustering module (out of scope). | `org.apache.catalina.connector.Response`, `org.apache.catalina.tribes.group.Response`, `org.apache.coyote.Response` |
| `CoyoteResponse` | 11, 31 | created by the `Processor`, `setNote()` | `org.apache.coyote.Response` has `setNote()`. No type is called `CoyoteResponse`. | `org.apache.catalina.connector.Response`, `org.apache.coyote.Response`, `none` |
| `InputBuffer` | 21_http11 | the `Processor` calls `parseRequestLine()` and `parseHeaders()` | Neither type named `InputBuffer` has these methods. `org.apache.coyote.http11.Http11InputBuffer` (which implements `org.apache.coyote.InputBuffer`) has both. | `org.apache.catalina.connector.InputBuffer`, `org.apache.coyote.InputBuffer`, `org.apache.coyote.http11.Http11InputBuffer` |
| `SocketProcessor` | 11_nio | created by `NioEndpoint`, run by a `Worker`, calls `handshake()` and `process()` | There are two nested types of this name, one in `NioEndpoint` and one in `Nio2Endpoint`. The other boxes of diagram 11_nio are `NioEndpoint` and its `Poller` (`NioEndpoint$Poller`); `Nio2Endpoint` appears in no diagram. | `org.apache.tomcat.util.net.Nio2Endpoint$SocketProcessor`, `org.apache.tomcat.util.net.NioEndpoint$SocketProcessor` |

## Boxes without a type of that name

Some of these boxes are not Tomcat code (JDK classes, code of the web application, a role). Mapping such a box lets the check test whether Tomcat calls that type. Not mapping it (`none`) means its arrows count as absent because of the mapping, which the paper reports separately.

| Box | Diagram | What the box does in the diagram | Facts from the code | Candidates |
|---|---|---|---|---|
| `Global Naming Resources` | 2, 3 | the `Server` calls `init()` and `start()` | The field `globalNamingResources` of `StandardServer` has the type `org.apache.catalina.deploy.NamingResourcesImpl`, which has `init()` and `start()`. | `org.apache.catalina.deploy.NamingResourcesImpl`, `none` |
| `SCI` | 5 | the `Context` calls `onStartup` | Usual abbreviation for `ServletContainerInitializer` (Servlet API), which has `onStartup()`. | `jakarta.servlet.ServletContainerInitializer`, `none` |
| `Filter A`, `Filter B` | 31 | `FilterChain` and filter call `doFilter()` on each other | Filters of the web application, not part of Tomcat. Their common interface is `jakarta.servlet.Filter`. | `jakarta.servlet.Filter`, `none` |
| `Selector` | 11_nio | the `Poller` calls `select()` | JDK class. The field `selector` of `NioEndpoint$Poller` has the type `java.nio.channels.Selector`. | `java.nio.channels.Selector`, `none` |
| `ServerSocket` | 11_nio | `NioEndpoint` calls `accept()`; creates the `SocketChannel` | JDK class. The field `serverSock` of `NioEndpoint` has the type `java.nio.channels.ServerSocketChannel`. | `java.nio.channels.ServerSocketChannel`, `none` |
| `SocketChannel` | 11_nio | created by the `ServerSocket`; `register()`, `handshake()` | JDK class (the connection to one client). | `java.nio.channels.SocketChannel`, `none` |
| `UtilityExecutor` | 4 | the `Container` calls `scheduleWithFixedDelay()`; creates the `ContainerBackgroundProcessor` | JDK class. The field `utilityExecutorWrapper` of `StandardServer` has the type `java.util.concurrent.ScheduledExecutorService`. | `java.util.concurrent.ScheduledExecutorService`, `none` |
| `Child` | 4 | the `Container` calls `start()` on its children | A role: a child of a container is again an `org.apache.catalina.Container`. The box `Container` already maps to this type, so the arrow `Container → Child` would connect a type with itself. | `org.apache.catalina.Container`, `none` |

## Afterwards

`node analysis/compare_reviews.js analysis/review/mapping_<a>.csv analysis/review/mapping_<b>.csv participant type` prints the agreement and the rows we disagree on. We then settle the disagreements together and record how.
